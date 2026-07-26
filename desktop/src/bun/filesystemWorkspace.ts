import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, rmdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { ensureBootstrapUser } from "./filesystemWorkspaceBootstrap";
import {
  assertWorkspacePath,
  atomicWrite,
  atomicWorkspaceWrite,
  asJsonRecord,
  BOOTSTRAP_USER_ID,
  digest,
  documentForDrawing,
  documentForSnapshot,
  emptyIndex,
  FORMAT_VERSION,
  INDEX_PATH,
  isInside,
  listDrawingFiles,
  parseJson,
  PROJECT_FILE,
  resolveWorkspaceRoot,
  serialize,
  SETTINGS_FILE,
  slug,
  type CollectionRow,
  type DrawingRow,
  type ExcalidrawDocument,
  type WorkspaceIndex,
  type WorkspacePrisma,
} from "./filesystemWorkspaceFormat";
import { importWorkspaceHistory } from "./filesystemWorkspaceHistory";
import { readProjectDirectories } from "./filesystemWorkspaceProjects";

export class FilesystemWorkspace {
  private root: string;
  private index = emptyIndex();
  private syncing: Promise<void> | null = null;
  private reconciling: Promise<void> | null = null;
  private rootChange: Promise<void> | null = null;

  constructor(
    private readonly prisma: WorkspacePrisma,
    private readonly dataDir: string,
    defaultRoot = join(homedir(), ".localdraw"),
  ) {
    this.root = resolve(defaultRoot);
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const settings = parseJson<{ path?: string }>(
      await readFile(join(this.dataDir, SETTINGS_FILE), "utf8").catch(() => "{}"),
      {},
    );
    if (settings.path) this.root = resolveWorkspaceRoot(settings.path);
    await this.ensureRoot();
    await this.loadIndex();
    await ensureBootstrapUser(this.prisma);
    const [collections, drawings] = await Promise.all([
      this.prisma.collection.findMany({ take: 1 }),
      this.prisma.drawing.findMany({ take: 1 }),
    ]);
    if (collections.length === 0 && drawings.length === 0) {
      this.index = emptyIndex();
    }
    await this.rescan();
  }

  getStatus(): { path: string; defaultPath: string; formatVersion: number } {
    return {
      path: this.root,
      defaultPath: join(homedir(), ".localdraw"),
      formatVersion: FORMAT_VERSION,
    };
  }

  async setRoot(nextPath: string): Promise<void> {
    if (this.rootChange) await this.rootChange;
    this.rootChange = this.performRootChange(nextPath).finally(() => {
      this.rootChange = null;
    });
    return this.rootChange;
  }

  private async performRootChange(nextPath: string): Promise<void> {
    const nextRoot = resolveWorkspaceRoot(nextPath);
    if (nextRoot === this.root) return;
    if (isInside(this.root, nextRoot) || isInside(nextRoot, this.root)) {
      throw new Error("The new workspace cannot contain the current workspace");
    }
    if (this.reconciling) await this.reconciling;
    if (this.syncing) await this.syncing;
    await this.importChangedFiles();
    await importWorkspaceHistory(this.prisma, this.root);
    await this.syncFromDatabase();
    await mkdir(nextRoot, { recursive: true });
    await cp(this.root, nextRoot, { recursive: true, force: false, errorOnExist: false });
    this.root = nextRoot;
    await atomicWrite(
      join(this.dataDir, SETTINGS_FILE),
      serialize({ path: this.root }),
    );
    await this.loadIndex();
    await this.importChangedFiles();
    await importWorkspaceHistory(this.prisma, this.root);
    await this.syncFromDatabase();
  }

  async rescan(): Promise<void> {
    if (this.rootChange) await this.rootChange;
    if (this.reconciling) return this.reconciling;
    this.reconciling = (async () => {
      await this.importChangedFiles();
      await importWorkspaceHistory(this.prisma, this.root);
      await this.syncFromDatabase();
    })().finally(() => {
      this.reconciling = null;
    });
    return this.reconciling;
  }

  async flush(): Promise<void> {
    if (this.rootChange) await this.rootChange;
    await this.rescan();
  }

  async syncFromDatabase(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = this.performDatabaseSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async ensureRoot(): Promise<void> {
    await Promise.all([
      mkdir(join(this.root, "projects"), { recursive: true }),
      mkdir(join(this.root, "unfiled"), { recursive: true }),
      mkdir(join(this.root, "trash"), { recursive: true }),
      mkdir(join(this.root, ".localdraw", "history"), { recursive: true }),
    ]);
  }

  private async loadIndex(): Promise<void> {
    await this.ensureRoot();
    this.index = parseJson<WorkspaceIndex>(
      await readFile(join(this.root, INDEX_PATH), "utf8").catch(() => ""),
      emptyIndex(),
    );
  }

  private projectDirectory(collection: CollectionRow): string {
    const existing = this.index.projects[collection.id]?.path;
    if (existing && dirname(existing) === "projects") {
      return existing;
    }
    return join(
      "projects",
      `${slug(collection.name, "project")}-${collection.id.slice(0, 8)}`,
    );
  }

  private drawingDirectory(
    drawing: DrawingRow,
    collections: Map<string, CollectionRow>,
  ): string {
    if (drawing.collectionId?.startsWith("trash:")) return "trash";
    if (!drawing.collectionId) return "unfiled";
    const collection = collections.get(drawing.collectionId);
    return collection ? this.projectDirectory(collection) : "unfiled";
  }

  private async performDatabaseSync(): Promise<void> {
    await this.ensureRoot();
    const [collections, drawings] = await Promise.all([
      this.prisma.collection.findMany({ orderBy: { createdAt: "asc" } }),
      this.prisma.drawing.findMany({
        include: { snapshots: { orderBy: { createdAt: "asc" } } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const collectionMap = new Map(collections.map((collection) => [collection.id, collection]));
    const nextIndex = emptyIndex();

    for (const collection of collections.filter((item) => !item.id.startsWith("trash:"))) {
      const projectPath = this.projectDirectory(collection);
      const slideOrder = drawings
        .filter((drawing) => drawing.collectionId === collection.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((drawing) => drawing.id);
      const projectManifest = serialize({
          formatVersion: FORMAT_VERSION,
          id: collection.id,
          name: collection.name,
          color: collection.color,
          slideOrder,
        });
      const projectManifestPath = join(this.root, projectPath, PROJECT_FILE);
      nextIndex.projects[collection.id] = {
        path: projectPath,
        hash: digest(projectManifest),
      };
      if (
        (await readFile(projectManifestPath, "utf8").catch(() => "")) !==
        projectManifest
      ) {
        await atomicWorkspaceWrite(this.root, projectManifestPath, projectManifest);
      }
    }

    for (const drawing of drawings) {
      const directory = this.drawingDirectory(drawing, collectionMap);
      const existing = this.index.drawings[drawing.id]?.path;
      const relativePath = existing &&
        isInside(this.root, resolve(this.root, existing)) &&
        dirname(existing) === directory
        ? existing
        : join(directory, `${slug(drawing.name, "drawing")}-${drawing.id.slice(0, 8)}.excalidraw`);
      const serialized = serialize(documentForDrawing(drawing));
      const serializedHash = digest(serialized);
      const absoluteDrawingPath = join(this.root, relativePath);
      const currentContents = await readFile(absoluteDrawingPath, "utf8").catch(
        () => "",
      );
      if (digest(currentContents) !== serializedHash) {
        await atomicWorkspaceWrite(this.root, absoluteDrawingPath, serialized);
      }
      nextIndex.drawings[drawing.id] = { path: relativePath, hash: serializedHash };

      const historyDirectory = join(this.root, ".localdraw", "history", drawing.id);
      await assertWorkspacePath(this.root, historyDirectory);
      await mkdir(historyDirectory, { recursive: true });
      const expectedSnapshots = new Set<string>();
      for (const snapshot of drawing.snapshots) {
        const filename = `${snapshot.version}-${snapshot.id}.excalidraw`;
        expectedSnapshots.add(filename);
        const snapshotPath = join(historyDirectory, filename);
        if (!(await readFile(snapshotPath, "utf8").catch(() => ""))) {
          await atomicWorkspaceWrite(
            this.root,
            snapshotPath,
            serialize(documentForSnapshot(drawing, snapshot)),
          );
        }
      }
      for (const entry of await readdir(historyDirectory).catch(() => [])) {
        if (entry.endsWith(".excalidraw") && !expectedSnapshots.has(entry)) {
          await assertWorkspacePath(this.root, join(historyDirectory, entry));
          await rm(join(historyDirectory, entry), { force: true });
        }
      }
    }

    for (const [id, previous] of Object.entries(this.index.drawings)) {
      const next = nextIndex.drawings[id];
      if (!next || next.path !== previous.path) {
        const oldPath = resolve(this.root, previous.path);
        await assertWorkspacePath(this.root, oldPath);
        await rm(oldPath, { force: true });
      }
    }
    for (const [id, previous] of Object.entries(this.index.projects)) {
      if (nextIndex.projects[id]) continue;
      const oldDirectory = resolve(this.root, previous.path);
      const oldManifest = join(oldDirectory, PROJECT_FILE);
      await assertWorkspacePath(this.root, oldManifest);
      await rm(oldManifest, { force: true });
      await rmdir(oldDirectory).catch(() => undefined);
    }
    nextIndex.syncedAt = new Date().toISOString();
    await atomicWorkspaceWrite(
      this.root,
      join(this.root, INDEX_PATH),
      serialize(nextIndex),
    );
    this.index = nextIndex;
  }

  private async importChangedFiles(): Promise<void> {
    const projectByDirectory = await readProjectDirectories(
      this.prisma,
      this.root,
      this.index,
    );
    for (const absolutePath of await listDrawingFiles(this.root)) {
      const relativePath = relative(this.root, absolutePath);
      const fileSize = (await stat(absolutePath).catch(() => null))?.size ?? 0;
      if (fileSize <= 0 || fileSize > 50 * 1024 * 1024) continue;
      const contents = await readFile(absolutePath, "utf8").catch(() => "");
      if (!contents) continue;
      const parsed = parseJson<Partial<ExcalidrawDocument>>(contents, {});
      if (parsed.type !== "excalidraw" || !Array.isArray(parsed.elements)) continue;
      const requestedId = parsed.localdraw?.id;
      const id = requestedId && /^[a-zA-Z0-9:_-]{1,128}$/.test(requestedId)
        ? requestedId
        : randomUUID();
      const previous = this.index.drawings[id];
      const hash = digest(contents);
      const existing = await this.prisma.drawing.findUnique({ where: { id } });
      const project = projectByDirectory.get(dirname(relativePath));
      const collectionId = project?.id ?? null;
      const manifestSortOrder = project?.slideOrder.indexOf(id) ?? -1;
      if (
        previous?.hash === hash &&
        previous.path === relativePath &&
        (!existing || !project?.changed)
      ) {
        continue;
      }
      const name = parsed.localdraw?.name || basename(relativePath, ".excalidraw");
      const elements = JSON.stringify(parsed.elements);
      const appState = JSON.stringify(asJsonRecord(parsed.appState));
      const files = JSON.stringify(asJsonRecord(parsed.files));
      if (existing) {
        const contentChanged = elements !== existing.elements ||
          appState !== existing.appState || files !== existing.files;
        const sortOrder = manifestSortOrder !== -1
          ? manifestSortOrder
          : (parsed.localdraw?.sortOrder ?? existing.sortOrder);
        if (contentChanged) {
          await this.prisma.drawingSnapshot.create({
            data: {
              drawingId: id,
              version: existing.version,
              elements: existing.elements,
              appState: existing.appState,
              files: existing.files,
            },
          });
          await this.prisma.drawing.update({
            where: { id },
            data: {
              name,
              elements,
              appState,
              files,
              collectionId,
              sortOrder,
              version: Math.max(
                existing.version + 1,
                parsed.localdraw?.version ?? 1,
              ),
            },
          });
        } else {
          await this.prisma.drawing.update({
            where: { id },
            data: { name, collectionId, sortOrder },
          });
        }
      } else {
        await this.prisma.drawing.create({
          data: {
            id,
            name,
            elements,
            appState,
            files,
            userId: BOOTSTRAP_USER_ID,
            collectionId,
            sortOrder: manifestSortOrder !== -1
              ? manifestSortOrder
              : (parsed.localdraw?.sortOrder ?? 0),
            version: parsed.localdraw?.version ?? 1,
          },
        });
      }
      this.index.drawings[id] = { path: relativePath, hash };
    }
  }

}
