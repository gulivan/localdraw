import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  asJsonRecord,
  atomicWrite,
  atomicWorkspaceWrite,
  digest,
  drawingNameFromPath,
  emptyProjectManifest,
  emptyWorkspaceManifest,
  FORMAT_VERSION,
  INDEX_PATH,
  listExcalidrawFiles,
  MAX_DRAWING_BYTES,
  METADATA_DIRECTORY,
  nowIso,
  parseJson,
  PROJECT_FILE,
  resolveWorkspaceRoot,
  isInside,
  searchableText,
  serialize,
  SETTINGS_FILE,
  slug,
  uniquePath,
  WORKSPACE_MANIFEST,
  type CollectionRecord,
  type DrawingRecord,
  type ExcalidrawDocument,
  type JsonRecord,
  type ProjectManifest,
  type WorkspaceManifest,
} from "./filesystemWorkspaceFormat";

const HISTORY_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const LOCAL_USER = {
  id: "localdraw",
  email: "local@localdraw.invalid",
  name: "LocalDraw",
};
const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
const safeTimestamp = (value: unknown, fallback: string): string =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
const safeOrder = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(safeId) : [];

export class FileConflictError extends Error {
  constructor(
    readonly drawingId: string,
    readonly conflictPath: string,
    readonly currentVersion: number,
  ) {
    super("Drawing changed on disk");
  }
}

export type DrawingUpdate = Partial<Pick<
  DrawingRecord,
  "name" | "elements" | "appState" | "files" | "preview" | "collectionId"
>> & { version?: number };

type DrawingListOptions = {
  search?: string;
  collectionId?: string | null;
  includeData?: boolean;
  includePreview?: boolean;
  limit?: number;
  offset?: number;
  sortField?: "name" | "createdAt" | "updatedAt" | "sortOrder";
  sortDirection?: "asc" | "desc";
};

export class FilesystemWorkspace {
  private root: string;
  private readonly defaultRoot: string;
  private manifest = emptyWorkspaceManifest();
  private drawings = new Map<string, DrawingRecord>();
  private collections = new Map<string, CollectionRecord>();
  private operation: Promise<void> = Promise.resolve();
  private watchers: FSWatcher[] = [];
  private watcherTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(revision: number) => void>();
  private signature = "";
  private revision = 0;
  private state: "ready" | "missing" | "read-only" | "scanning" = "scanning";

  constructor(
    private readonly dataDir: string,
    defaultRoot = join(homedir(), "Documents", "LocalDraw"),
  ) {
    this.defaultRoot = resolve(defaultRoot);
    this.root = this.defaultRoot;
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const settings = parseJson<{ path?: string }>(
      await readFile(join(this.dataDir, SETTINGS_FILE), "utf8").catch(() => "{}"),
      {},
    );
    if (settings.path) {
      this.root = resolveWorkspaceRoot(settings.path);
      if (!(await stat(this.root).catch(() => null))) {
        this.state = "missing";
        return;
      }
    }
    try {
      await this.exclusive(async () => this.scanDirect());
      this.state = "ready";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES" ||
          (error as NodeJS.ErrnoException).code === "EROFS") {
        this.state = "read-only";
        return;
      }
      throw error;
    }
    await this.restartWatchers();
  }

  close(): void {
    if (this.watcherTimer) clearTimeout(this.watcherTimer);
    this.watcherTimer = null;
    this.watchers.splice(0).forEach((item) => item.close());
  }

  async flush(): Promise<void> {
    await this.operation;
  }

  onChange(listener: (revision: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publishChange(): void {
    this.revision += 1;
    this.listeners.forEach((listener) => listener(this.revision));
  }

  getStatus() {
    return {
      path: this.root,
      defaultPath: this.defaultRoot,
      formatVersion: FORMAT_VERSION,
      revision: this.revision,
      state: this.state,
    };
  }

  getMcpApiKeyStorePath(): string {
    return join(this.dataDir, "mcp-api-keys.json");
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.operation.then(task, task);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  async rescan(): Promise<void> {
    const info = await stat(this.root).catch(() => null);
    if (!info?.isDirectory()) {
      const changed = this.state !== "missing";
      this.state = "missing";
      if (changed) this.publishChange();
      return;
    }
    this.state = "scanning";
    try {
      await this.exclusive(async () => this.scanDirect());
      this.state = "ready";
    } catch (error) {
      this.state = (error as NodeJS.ErrnoException).code === "EACCES" ||
        (error as NodeJS.ErrnoException).code === "EROFS"
        ? "read-only"
        : "missing";
      this.publishChange();
      throw error;
    }
  }

  async openRoot(nextPath: string): Promise<void> {
    const target = resolveWorkspaceRoot(nextPath);
    const info = await stat(target).catch(() => null);
    if (!info?.isDirectory()) throw new Error("Selected workspace folder was not found");
    await this.exclusive(async () => {
      const previous = this.captureState();
      try {
        this.root = target;
        await this.scanDirect();
        this.state = "ready";
        await atomicWrite(join(this.dataDir, SETTINGS_FILE), serialize({ path: this.root }));
      } catch (error) {
        this.restoreState(previous);
        throw error;
      }
    });
    await this.restartWatchers();
  }

  async moveRoot(nextPath: string): Promise<void> {
    const target = resolveWorkspaceRoot(nextPath);
    if (target === this.root) return;
    if (isInside(this.root, target) || isInside(target, this.root)) {
      throw new Error("The move destination cannot contain the current workspace");
    }
    const entries = await readdir(target).catch(() => []);
    if (entries.length > 0) throw new Error("Move destination must be empty");
    await this.exclusive(async () => {
      const previous = this.captureState();
      await mkdir(target, { recursive: true });
      const managed = await this.listManagedFiles();
      try {
        for (const source of managed) {
          const destination = join(target, relative(this.root, source));
          await mkdir(dirname(destination), { recursive: true });
          await cp(source, destination, { force: false, errorOnExist: true });
          if (digest(await readFile(source)) !== digest(await readFile(destination))) {
            throw new Error(`Moved workspace verification failed for ${relative(this.root, source)}`);
          }
        }
        const previousRoot = this.root;
        this.root = target;
        await this.scanDirect();
        this.state = "ready";
        await atomicWrite(join(this.dataDir, SETTINGS_FILE), serialize({ path: this.root }));
        for (const source of managed) {
          await rm(source, { force: true }).catch((error) => {
            console.warn("[workspace] could not remove moved source file", { source, error });
          });
        }
        for (const collection of previous.collections.values()) {
          await rmdir(join(previousRoot, collection.path)).catch(() => undefined);
        }
        await rm(join(previousRoot, METADATA_DIRECTORY), {
          recursive: true,
          force: true,
        }).catch((error) => {
          console.warn("[workspace] could not remove moved metadata directory", {
            path: join(previousRoot, METADATA_DIRECTORY),
            error,
          });
        });
      } catch (error) {
        this.restoreState(previous);
        throw error;
      }
    });
    await this.restartWatchers();
  }

  private captureState() {
    return {
      root: this.root,
      manifest: this.manifest,
      drawings: this.drawings,
      collections: this.collections,
      signature: this.signature,
      revision: this.revision,
      state: this.state,
    };
  }

  private restoreState(previous: ReturnType<FilesystemWorkspace["captureState"]>): void {
    this.root = previous.root;
    this.manifest = previous.manifest;
    this.drawings = previous.drawings;
    this.collections = previous.collections;
    this.signature = previous.signature;
    this.revision = previous.revision;
    this.state = previous.state;
  }

  private async listManagedFiles(): Promise<string[]> {
    const files = [...await listExcalidrawFiles(this.root)];
    for (const collection of this.collections.values()) {
      const directory = join(this.root, collection.path);
      files.push(...await listExcalidrawFiles(directory));
      const manifest = join(directory, PROJECT_FILE);
      if (await stat(manifest).catch(() => null)) files.push(manifest);
    }
    const metadataRoot = join(this.root, METADATA_DIRECTORY);
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        if (entry.isSymbolicLink()) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile()) files.push(path);
      }
    };
    await visit(metadataRoot);
    return [...new Set(files.map((path) => resolve(path)))];
  }

  private async ensureRoot(): Promise<void> {
    await Promise.all([
      mkdir(this.root, { recursive: true }),
      mkdir(join(this.root, METADATA_DIRECTORY, "trash"), { recursive: true }),
      mkdir(join(this.root, METADATA_DIRECTORY, "history"), { recursive: true }),
      mkdir(join(this.root, METADATA_DIRECTORY, "previews"), { recursive: true }),
      mkdir(join(this.root, METADATA_DIRECTORY, "conflicts"), { recursive: true }),
    ]);
  }

  private async scanDirect(): Promise<void> {
    await this.ensureRoot();
    const manifestPath = join(this.root, WORKSPACE_MANIFEST);
    const storedManifest = parseJson<WorkspaceManifest | null>(
      await readFile(manifestPath, "utf8").catch(() => ""),
      null,
    );
    const fallbackManifest = emptyWorkspaceManifest();
    this.manifest = storedManifest?.formatVersion === FORMAT_VERSION &&
      safeId(storedManifest.id)
      ? {
          formatVersion: FORMAT_VERSION,
          id: storedManifest.id,
          createdAt: safeTimestamp(storedManifest.createdAt, fallbackManifest.createdAt),
          updatedAt: safeTimestamp(storedManifest.updatedAt, fallbackManifest.updatedAt),
          unfiledOrder: safeOrder(storedManifest.unfiledOrder),
          trashOrder: safeOrder(storedManifest.trashOrder),
        }
      : fallbackManifest;

    const previousDrawings = this.drawings;
    const nextDrawings = new Map<string, DrawingRecord>();
    const nextCollections = new Map<string, CollectionRecord>();

    const rootFiles = await listExcalidrawFiles(this.root);
    await this.readDrawingGroup(
      rootFiles,
      null,
      this.manifest.unfiledOrder,
      previousDrawings,
      nextDrawings,
    );

    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === METADATA_DIRECTORY) continue;
      const directory = join(this.root, entry.name);
      const drawingFiles = await listExcalidrawFiles(directory);
      const manifestFile = join(directory, PROJECT_FILE);
      const stored = parseJson<ProjectManifest | null>(
        await readFile(manifestFile, "utf8").catch(() => ""),
        null,
      );
      if (drawingFiles.length === 0 && !stored) continue;
      const fallbackProject = emptyProjectManifest();
      let project = stored?.formatVersion === FORMAT_VERSION && safeId(stored.id)
        ? {
            formatVersion: FORMAT_VERSION,
            id: stored.id,
            color: typeof stored.color === "string" ? stored.color : fallbackProject.color,
            createdAt: safeTimestamp(stored.createdAt, fallbackProject.createdAt),
            updatedAt: safeTimestamp(stored.updatedAt, fallbackProject.updatedAt),
            canvasOrder: safeOrder(stored.canvasOrder),
          }
        : fallbackProject;
      let previousCollection = this.collections.get(project.id);
      if (
        (previousCollection &&
          previousCollection.path !== relative(this.root, directory) &&
          await stat(join(this.root, previousCollection.path)).catch(() => null)) ||
        nextCollections.has(project.id)
      ) {
        const now = nowIso();
        project = {
          ...project,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          canvasOrder: [],
        };
        previousCollection = undefined;
      }
      const collection: CollectionRecord = {
        id: project.id,
        name: entry.name,
        color: /^#[0-9a-f]{6}$/i.test(project.color) ? project.color.toLowerCase() : "#7c3aed",
        createdAt: project.createdAt || nowIso(),
        updatedAt: project.updatedAt || nowIso(),
        path: relative(this.root, directory),
        canvasOrder: project.canvasOrder || [],
      };
      if (previousCollection && (
        previousCollection.name !== collection.name ||
        previousCollection.path !== collection.path ||
        previousCollection.color !== collection.color
      )) {
        collection.updatedAt = nowIso();
      }
      nextCollections.set(collection.id, collection);
      await this.readDrawingGroup(
        drawingFiles,
        collection.id,
        collection.canvasOrder,
        previousDrawings,
        nextDrawings,
      );
      const normalizedProjectOrder = this.normalizedOrder(
        collection.canvasOrder,
        [...nextDrawings.values()].filter((item) => item.collectionId === collection.id),
      );
      if (serialize(normalizedProjectOrder) !== serialize(collection.canvasOrder)) {
        collection.canvasOrder = normalizedProjectOrder;
        collection.updatedAt = nowIso();
      }
      const projectContents = serialize(this.projectManifest(collection));
      if ((await readFile(manifestFile, "utf8").catch(() => "")) !== projectContents) {
        await atomicWorkspaceWrite(this.root, manifestFile, projectContents);
      }
    }

    const trashFiles = await listExcalidrawFiles(join(this.root, METADATA_DIRECTORY, "trash"));
    await this.readDrawingGroup(
      trashFiles,
      "trash",
      this.manifest.trashOrder,
      previousDrawings,
      nextDrawings,
    );

    const unfiledOrder = this.normalizedOrder(
      this.manifest.unfiledOrder,
      [...nextDrawings.values()].filter((item) => item.collectionId === null),
    );
    const trashOrder = this.normalizedOrder(
      this.manifest.trashOrder,
      [...nextDrawings.values()].filter((item) => item.collectionId === "trash"),
    );
    if (!storedManifest || serialize(unfiledOrder) !== serialize(this.manifest.unfiledOrder) ||
        serialize(trashOrder) !== serialize(this.manifest.trashOrder)) {
      this.manifest.unfiledOrder = unfiledOrder;
      this.manifest.trashOrder = trashOrder;
      this.manifest.updatedAt = nowIso();
    }
    const manifestContents = serialize(this.manifest);
    if ((await readFile(manifestPath, "utf8").catch(() => "")) !== manifestContents) {
      await atomicWorkspaceWrite(this.root, manifestPath, manifestContents);
    }

    this.drawings = nextDrawings;
    this.collections = nextCollections;
    await this.writeDerivedIndex();
    await this.pruneHistory();

    const nextSignature = digest(serialize({
      drawings: [...nextDrawings.values()].map((item) => [item.id, item.path, item.digest]),
      collections: [...nextCollections.values()].map((item) => [item.id, item.path, item.color, item.canvasOrder]),
    }));
    if (this.signature && this.signature !== nextSignature) {
      this.publishChange();
    }
    this.signature = nextSignature;
  }

  private normalizedOrder(order: string[], drawings: DrawingRecord[]): string[] {
    const ids = new Set(drawings.map((item) => item.id));
    const retained = order.filter((id, index) => ids.has(id) && order.indexOf(id) === index);
    const missing = drawings
      .filter((item) => !retained.includes(item.id))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((item) => item.id);
    return [...retained, ...missing];
  }

  private async readDrawingGroup(
    files: string[],
    collectionId: string | null,
    order: string[],
    previous: Map<string, DrawingRecord>,
    target: Map<string, DrawingRecord>,
  ): Promise<void> {
    const parsed: DrawingRecord[] = [];
    for (const path of files.sort()) {
      const record = await this.readDrawing(path, collectionId, order, previous);
      if (!record) continue;
      if (target.has(record.id)) {
        const now = nowIso();
        record.id = randomUUID();
        record.version = 1;
        record.createdAt = now;
        record.updatedAt = now;
        record.preview = null;
      }
      parsed.push(record);
    }
    const normalized = this.normalizedOrder(order, parsed);
    for (const record of parsed) {
      record.sortOrder = normalized.indexOf(record.id);
      await this.persistRecordMetadata(record);
      target.set(record.id, record);
    }
  }

  private async readDrawing(
    path: string,
    collectionId: string | null,
    order: string[],
    previous: Map<string, DrawingRecord>,
  ): Promise<DrawingRecord | null> {
    const info = await stat(path).catch(() => null);
    if (!info || info.size <= 0 || info.size > MAX_DRAWING_BYTES) return null;
    const contents = await readFile(path, "utf8").catch(() => "");
    const document = parseJson<Partial<ExcalidrawDocument>>(contents, {});
    if (document.type !== "excalidraw" || !Array.isArray(document.elements)) return null;
    const relativePath = relative(this.root, path);
    let id = safeId(document.localdraw?.id)
      ? document.localdraw.id
      : randomUUID();
    const name = drawingNameFromPath(path);
    let old = previous.get(id);
    let copiedDrawing = false;
    if (
      old &&
      old.path !== relativePath &&
      await stat(join(this.root, old.path)).catch(() => null)
    ) {
      id = randomUUID();
      old = undefined;
      copiedDrawing = true;
    }
    const elements = document.elements;
    const appState = asJsonRecord(document.appState);
    const files = asJsonRecord(document.files);
    const contentChanged = Boolean(old && (
      serialize(old.elements) !== serialize(elements) ||
      serialize(old.appState) !== serialize(appState) ||
      serialize(old.files) !== serialize(files)
    ));
    if (contentChanged && digest(contents) !== old!.digest) await this.writeSnapshot(old!);
    const metadataChanged = Boolean(old && (
      old.name !== name ||
      old.collectionId !== collectionId ||
      old.path !== relativePath
    ));
    const filesystemCreatedAt = (info.birthtimeMs > 0 ? info.birthtime : info.mtime).toISOString();
    const storedVersion = Number.isInteger(document.localdraw?.version) &&
      Number(document.localdraw?.version) > 0
      ? Number(document.localdraw?.version)
      : 1;
    const createdAt = copiedDrawing
      ? nowIso()
      : safeTimestamp(document.localdraw?.createdAt, filesystemCreatedAt);
    const updatedAt = copiedDrawing || contentChanged || metadataChanged
      ? nowIso()
      : safeTimestamp(document.localdraw?.updatedAt, info.mtime.toISOString());
    const version = copiedDrawing
      ? 1
      : contentChanged
      ? Math.max(storedVersion + 1, old!.version + 1)
      : storedVersion;
    const preview = await readFile(
      join(this.root, METADATA_DIRECTORY, "previews", `${id}.svg`),
      "utf8",
    ).catch(() => null);
    return {
      id,
      name,
      collectionId,
      sortOrder: Math.max(0, order.indexOf(id)),
      version,
      createdAt,
      updatedAt,
      preview,
      elements,
      appState,
      files,
      path: relativePath,
      digest: digest(contents),
      searchText: searchableText(name, elements),
    };
  }

  private documentFor(
    record: DrawingRecord,
    snapshotId?: string,
    snapshotCreatedAt?: string,
  ): ExcalidrawDocument {
    return {
      type: "excalidraw",
      version: 2,
      source: "https://github.com/gulivan/localdraw",
      elements: record.elements,
      appState: record.appState,
      files: record.files,
      localdraw: {
        id: record.id,
        name: record.name,
        version: record.version,
        collectionId: record.collectionId,
        sortOrder: record.sortOrder,
        createdAt: record.createdAt,
        updatedAt: snapshotCreatedAt ?? record.updatedAt,
        ...(snapshotId ? { snapshotId } : {}),
      },
    };
  }

  private async persistRecordMetadata(record: DrawingRecord): Promise<void> {
    const path = join(this.root, record.path);
    const serialized = serialize(this.documentFor(record));
    const nextDigest = digest(serialized);
    if (nextDigest !== record.digest) {
      await atomicWorkspaceWrite(this.root, path, serialized);
      record.digest = nextDigest;
    }
  }

  private projectManifest(collection: CollectionRecord): ProjectManifest {
    return {
      formatVersion: FORMAT_VERSION,
      id: collection.id,
      color: collection.color,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
      canvasOrder: collection.canvasOrder,
    };
  }

  private async writeDerivedIndex(): Promise<void> {
    const body = {
      formatVersion: FORMAT_VERSION,
      generatedAt: nowIso(),
      drawings: Object.fromEntries([...this.drawings.values()].map((item) => [item.id, {
        path: item.path,
        digest: item.digest,
        name: item.name,
        collectionId: item.collectionId,
        version: item.version,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        searchText: item.searchText,
      }])),
      projects: Object.fromEntries([...this.collections.values()].map((item) => [item.id, {
        path: item.path,
        color: item.color,
      }])),
    };
    const path = join(this.root, INDEX_PATH);
    const contents = serialize(body);
    const current = parseJson<Record<string, unknown>>(
      await readFile(path, "utf8").catch(() => "{}"),
      {},
    );
    const comparable = { ...current, generatedAt: body.generatedAt };
    if (serialize(comparable) !== contents) {
      await atomicWorkspaceWrite(this.root, path, contents);
    }
  }

  private async restartWatchers(): Promise<void> {
    this.watchers.splice(0).forEach((item) => item.close());
    const directories = [
      this.root,
      join(this.root, METADATA_DIRECTORY, "trash"),
      ...[...this.collections.values()].map((item) => join(this.root, item.path)),
    ];
    for (const directory of directories) {
      try {
        const watcher = watch(directory, () => this.scheduleWatcherRescan());
        watcher.on("error", (error) => console.warn("[workspace] watcher error", error));
        this.watchers.push(watcher);
      } catch (error) {
        console.warn("[workspace] could not watch directory", { directory, error });
      }
    }
    try {
      const metadataWatcher = watch(
        join(this.root, METADATA_DIRECTORY),
        (_event, filename) => {
          if (String(filename || "") === "manifest.json") {
            this.scheduleWatcherRescan();
          }
        },
      );
      metadataWatcher.on("error", (error) => {
        console.warn("[workspace] metadata watcher error", error);
      });
      this.watchers.push(metadataWatcher);
    } catch (error) {
      console.warn("[workspace] could not watch metadata directory", error);
    }
  }

  private scheduleWatcherRescan(): void {
    if (this.watcherTimer) clearTimeout(this.watcherTimer);
    this.watcherTimer = setTimeout(() => {
      this.watcherTimer = null;
      void this.rescan().then(() => this.restartWatchers()).catch((error) => {
        console.error("[workspace] external change scan failed", error);
      });
    }, 250);
  }

  private responseDrawing(record: DrawingRecord, includeData = true) {
    return {
      id: record.id,
      name: record.name,
      collectionId: record.collectionId,
      sortOrder: record.sortOrder,
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      preview: record.preview,
      accessLevel: "owner" as const,
      creatorName: LOCAL_USER.name,
      ...(includeData ? {
        elements: record.elements,
        appState: record.appState,
        files: record.files,
      } : {}),
    };
  }

  listDrawings(options: DrawingListOptions = {}) {
    let rows = [...this.drawings.values()];
    if (options.collectionId !== undefined) {
      rows = rows.filter((item) => item.collectionId === options.collectionId);
    } else {
      rows = rows.filter((item) => item.collectionId !== "trash");
    }
    const search = options.search?.trim().toLocaleLowerCase();
    if (search) rows = rows.filter((item) => item.searchText.includes(search));
    const field = options.sortField ?? "updatedAt";
    const direction = options.sortDirection ?? (field === "name" ? "asc" : "desc");
    rows.sort((left, right) => {
      const a = field === "name" ? left.name.toLocaleLowerCase() : left[field];
      const b = field === "name" ? right.name.toLocaleLowerCase() : right[field];
      const compared = typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b));
      return (direction === "asc" ? compared : -compared) || left.id.localeCompare(right.id);
    });
    const totalCount = rows.length;
    const offset = options.offset ?? 0;
    const limit = options.limit;
    rows = rows.slice(offset, limit ? offset + limit : undefined);
    return {
      drawings: rows.map((item) => {
        const response = this.responseDrawing(item, options.includeData === true);
        if (!options.includePreview) response.preview = null;
        return response;
      }),
      totalCount,
      ...(limit ? { limit } : {}),
      ...(offset ? { offset } : {}),
    };
  }

  getDrawing(id: string) {
    const drawing = this.drawings.get(id);
    return drawing ? this.responseDrawing(drawing) : null;
  }

  async createDrawing(
    name = "Untitled Drawing",
    collectionId: string | null = null,
    initial: Pick<DrawingUpdate, "elements" | "appState" | "files" | "preview"> = {},
  ) {
    return this.exclusive(async () => {
      if (collectionId && collectionId !== "trash" && !this.collections.has(collectionId)) {
        throw new Error("Collection not found");
      }
      const now = nowIso();
      const directory = this.directoryForCollection(collectionId);
      const path = await uniquePath(directory, name, ".excalidraw");
      const record: DrawingRecord = {
        id: randomUUID(),
        name: drawingNameFromPath(path),
        collectionId,
        sortOrder: this.orderFor(collectionId).length,
        version: 1,
        createdAt: now,
        updatedAt: now,
        preview: initial.preview ?? null,
        elements: initial.elements ?? [],
        appState: initial.appState ?? {},
        files: initial.files ?? {},
        path: relative(this.root, path),
        digest: "",
        searchText: name.toLocaleLowerCase(),
      };
      await this.appendOrder(collectionId, record.id);
      await this.persistRecordMetadata(record);
      if (record.preview) {
        await atomicWorkspaceWrite(
          this.root,
          join(this.root, METADATA_DIRECTORY, "previews", `${record.id}.svg`),
          record.preview,
        );
      }
      await this.scanDirect();
      return this.responseDrawing(this.drawings.get(record.id)!);
    });
  }

  async updateDrawing(id: string, update: DrawingUpdate) {
    return this.exclusive(async () => {
      const current = this.drawings.get(id);
      if (!current) throw new Error("Drawing not found");
      const absolutePath = join(this.root, current.path);
      const changedFields = Object.keys(update).filter((key) => key !== "version");
      if (changedFields.length === 1 && changedFields[0] === "preview") {
        const previewPath = join(this.root, METADATA_DIRECTORY, "previews", `${id}.svg`);
        if (update.preview) await atomicWorkspaceWrite(this.root, previewPath, update.preview);
        else await rm(previewPath, { force: true });
        current.preview = update.preview ?? null;
        await this.writeDerivedIndex();
        return this.responseDrawing(current);
      }
      const disk = await readFile(absolutePath, "utf8").catch(() => "");
      const sceneUpdate = update.elements !== undefined || update.appState !== undefined || update.files !== undefined;
      if (digest(disk) !== current.digest ||
          (sceneUpdate && update.version !== undefined && update.version !== current.version)) {
        const attempted = { ...current, ...update, version: current.version + 1, updatedAt: nowIso() };
        const conflictPath = await uniquePath(
          join(this.root, METADATA_DIRECTORY, "conflicts"),
          `${slug(current.name, "Canvas")}-${Date.now()}`,
          ".excalidraw",
        );
        await atomicWorkspaceWrite(this.root, conflictPath, serialize(this.documentFor(attempted)));
        throw new FileConflictError(id, relative(this.root, conflictPath), current.version);
      }
      if (sceneUpdate) await this.writeSnapshot(current);
      const next: DrawingRecord = {
        ...current,
        ...update,
        name: update.name?.trim() || current.name,
        collectionId: update.collectionId === undefined ? current.collectionId : update.collectionId,
        elements: update.elements ?? current.elements,
        appState: update.appState ?? current.appState,
        files: update.files ?? current.files,
        version: sceneUpdate ? current.version + 1 : current.version,
        updatedAt: update.preview !== undefined && Object.keys(update).length === 1
          ? current.updatedAt
          : nowIso(),
      };
      if (update.preview !== undefined) {
        const previewPath = join(this.root, METADATA_DIRECTORY, "previews", `${id}.svg`);
        if (update.preview) await atomicWorkspaceWrite(this.root, previewPath, update.preview);
        else await rm(previewPath, { force: true });
      }
      const collectionChanged = next.collectionId !== current.collectionId;
      if (collectionChanged) {
        if (next.collectionId && next.collectionId !== "trash" && !this.collections.has(next.collectionId)) {
          throw new Error("Collection not found");
        }
        await this.removeOrder(current.collectionId, id);
        await this.appendOrder(next.collectionId, id);
      }
      const targetDirectory = this.directoryForCollection(next.collectionId);
      const targetPath = await uniquePath(
        targetDirectory,
        next.name,
        ".excalidraw",
        collectionChanged ? undefined : absolutePath,
      );
      next.name = drawingNameFromPath(targetPath);
      next.path = relative(this.root, targetPath);
      next.sortOrder = this.orderFor(next.collectionId).indexOf(id);
      next.searchText = searchableText(next.name, next.elements);
      const serialized = serialize(this.documentFor(next));
      await atomicWorkspaceWrite(this.root, targetPath, serialized);
      next.digest = digest(serialized);
      if (resolve(targetPath) !== resolve(absolutePath)) await rm(absolutePath, { force: true });
      this.drawings.set(id, next);
      await this.scanDirect();
      return this.responseDrawing(this.drawings.get(id)!);
    });
  }

  async deleteDrawing(id: string, expectedUpdatedAt?: number): Promise<boolean> {
    return this.exclusive(async () => {
      const record = this.drawings.get(id);
      if (!record) throw new Error("Drawing not found");
      if (expectedUpdatedAt !== undefined) {
        const untouched = record.version === 1 && record.elements.length === 0 &&
          Object.keys(record.files).length === 0 && !record.preview &&
          new Date(record.updatedAt).getTime() === expectedUpdatedAt;
        if (!untouched) return false;
      }
      await rm(join(this.root, record.path), { force: true });
      await rm(join(this.root, METADATA_DIRECTORY, "previews", `${id}.svg`), { force: true });
      await this.removeOrder(record.collectionId, id);
      await this.scanDirect();
      return true;
    });
  }

  async duplicateDrawing(id: string) {
    const source = this.drawings.get(id);
    if (!source) throw new Error("Drawing not found");
    return this.createDrawing(`${source.name} (Copy)`, source.collectionId, {
      elements: structuredClone(source.elements),
      appState: structuredClone(source.appState),
      files: structuredClone(source.files),
      preview: source.preview,
    });
  }

  async placeDrawing(id: string, collectionId: string | null, targetIndex: number) {
    const current = this.drawings.get(id);
    if (!current) throw new Error("Drawing not found");
    if (current.collectionId !== collectionId) await this.updateDrawing(id, { collectionId });
    return this.exclusive(async () => {
      await this.removeOrder(collectionId, id);
      const order = this.orderFor(collectionId);
      order.splice(Math.min(Math.max(0, targetIndex), order.length), 0, id);
      await this.writeOrder(collectionId, order);
      await this.scanDirect();
      return {
        drawing: {
          id,
          collectionId,
          sortOrder: this.drawings.get(id)!.sortOrder,
        },
        orders: [this.placementOrder(collectionId)],
      };
    });
  }

  listCollections(includeOverview = false) {
    const collections = [...this.collections.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((collection) => {
        const drawings = [...this.drawings.values()]
          .filter((item) => item.collectionId === collection.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return {
          id: collection.id,
          name: collection.name,
          color: collection.color,
          createdAt: collection.createdAt,
          updatedAt: collection.updatedAt,
          ...(includeOverview ? {
            drawingCount: drawings.length,
            latestDrawing: drawings[0] ? this.responseDrawing(drawings[0], false) : null,
            lastActivityAt: drawings[0]?.updatedAt ?? collection.updatedAt,
          } : {}),
        };
      });
    const trash = [...this.drawings.values()].filter((item) => item.collectionId === "trash");
    return [...collections, {
      id: "trash",
      name: "Trash",
      color: "#71717a",
      createdAt: this.manifest.createdAt,
      updatedAt: this.manifest.updatedAt,
      ...(includeOverview ? {
        drawingCount: trash.length,
        latestDrawing: trash[0] ? this.responseDrawing(trash[0], false) : null,
        lastActivityAt: trash[0]?.updatedAt ?? this.manifest.updatedAt,
      } : {}),
    }];
  }

  async createCollection(name: string, color = "#7c3aed", createInitialDrawing = false) {
    const collection = await this.exclusive(async () => {
      const path = await uniquePath(this.root, name, "");
      await mkdir(path, { recursive: true });
      const manifest = emptyProjectManifest();
      manifest.color = color;
      await atomicWorkspaceWrite(this.root, join(path, PROJECT_FILE), serialize(manifest));
      await this.scanDirect();
      return this.collections.get(manifest.id)!;
    });
    let initialDrawing;
    try {
      initialDrawing = createInitialDrawing
        ? await this.createDrawing("Canvas 1", collection.id)
        : undefined;
    } catch (error) {
      await this.exclusive(async () => {
        await rm(join(this.root, collection.path), { recursive: true, force: true });
        await this.scanDirect();
      });
      throw error;
    }
    return {
      id: collection.id,
      name: collection.name,
      color: collection.color,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
      ...(initialDrawing ? {
        initialDrawingId: initialDrawing.id,
        initialDrawing: { id: initialDrawing.id, updatedAt: initialDrawing.updatedAt },
      } : {}),
    };
  }

  async updateCollection(id: string, changes: { name?: string; color?: string }) {
    return this.exclusive(async () => {
      const current = this.collections.get(id);
      if (!current) throw new Error("Collection not found");
      let directory = join(this.root, current.path);
      if (changes.name?.trim() && changes.name.trim() !== current.name) {
        const target = await uniquePath(this.root, changes.name.trim(), "", directory);
        await rename(directory, target);
        directory = target;
        current.path = relative(this.root, target);
        current.name = basename(target);
      }
      if (changes.color && /^#[0-9a-f]{6}$/i.test(changes.color)) {
        current.color = changes.color.toLowerCase();
      }
      current.updatedAt = nowIso();
      await atomicWorkspaceWrite(this.root, join(directory, PROJECT_FILE), serialize(this.projectManifest(current)));
      await this.scanDirect();
      const updated = this.collections.get(id)!;
      return { ...updated, createdAt: updated.createdAt, updatedAt: updated.updatedAt };
    });
  }

  async deleteCollection(id: string, deleteSlides: boolean): Promise<void> {
    const drawingIds = [...this.drawings.values()]
      .filter((item) => item.collectionId === id)
      .map((item) => item.id);
    for (const drawingId of drawingIds) {
      await this.updateDrawing(drawingId, { collectionId: deleteSlides ? "trash" : null });
    }
    await this.exclusive(async () => {
      const collection = this.collections.get(id);
      if (!collection) throw new Error("Collection not found");
      const directory = join(this.root, collection.path);
      await rm(join(directory, PROJECT_FILE), { force: true });
      await rmdir(directory).catch(() => undefined);
      await this.scanDirect();
    });
  }

  async listHistory(id: string, limit = 100, offset = 0) {
    const directory = join(this.root, METADATA_DIRECTORY, "history", id);
    const files = (await readdir(directory).catch(() => []))
      .filter((name) => name.endsWith(".excalidraw"))
      .sort().reverse();
    const snapshots = [];
    for (const name of files.slice(offset, offset + limit)) {
      const document = parseJson<Partial<ExcalidrawDocument>>(
        await readFile(join(directory, name), "utf8").catch(() => ""),
        {},
      );
      if (!document.localdraw?.snapshotId) continue;
      snapshots.push({
        id: document.localdraw.snapshotId,
        drawingId: id,
        version: document.localdraw.version,
        createdAt: document.localdraw.updatedAt,
      });
    }
    return { snapshots, totalCount: files.length };
  }

  async getSnapshot(id: string, snapshotId: string) {
    const directory = join(this.root, METADATA_DIRECTORY, "history", id);
    for (const name of await readdir(directory).catch(() => [])) {
      if (!name.endsWith(".excalidraw")) continue;
      const document = parseJson<Partial<ExcalidrawDocument>>(
        await readFile(join(directory, name), "utf8").catch(() => ""),
        {},
      );
      if (document.localdraw?.snapshotId !== snapshotId) continue;
      return {
        id: snapshotId,
        drawingId: id,
        version: document.localdraw.version,
        createdAt: document.localdraw.updatedAt,
        elements: document.elements ?? [],
        appState: asJsonRecord(document.appState),
        files: asJsonRecord(document.files),
      };
    }
    return null;
  }

  async restoreSnapshot(id: string, snapshotId: string) {
    const snapshot = await this.getSnapshot(id, snapshotId);
    const drawing = this.drawings.get(id);
    if (!snapshot || !drawing) throw new Error("Snapshot not found");
    return this.updateDrawing(id, {
      elements: snapshot.elements,
      appState: snapshot.appState,
      files: snapshot.files,
      version: drawing.version,
    });
  }

  async getLibrary(): Promise<unknown[]> {
    return parseJson<unknown[]>(
      await readFile(join(this.root, METADATA_DIRECTORY, "library.json"), "utf8").catch(() => "[]"),
      [],
    );
  }

  async updateLibrary(items: unknown[]): Promise<unknown[]> {
    return this.exclusive(async () => {
      await atomicWorkspaceWrite(
        this.root,
        join(this.root, METADATA_DIRECTORY, "library.json"),
        serialize(items),
      );
      return items;
    });
  }

  async getPreferences(): Promise<JsonRecord> {
    return parseJson<JsonRecord>(
      await readFile(join(this.root, METADATA_DIRECTORY, "preferences.json"), "utf8").catch(() => "{}"),
      {},
    );
  }

  async updatePreferences(changes: JsonRecord): Promise<JsonRecord> {
    return this.exclusive(async () => {
      const preferences = { ...(await this.getPreferences()), ...changes };
      await atomicWorkspaceWrite(
        this.root,
        join(this.root, METADATA_DIRECTORY, "preferences.json"),
        serialize(preferences),
      );
      return preferences;
    });
  }

  async archiveEntries(): Promise<Array<{ name: string; data: Uint8Array }>> {
    return this.exclusive(async () => {
      const entries: Array<{ name: string; data: Uint8Array }> = [];
      const visit = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
          const path = join(directory, entry.name);
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) await visit(path);
          else if (entry.isFile()) {
            entries.push({
              name: relative(this.root, path).replaceAll("\\", "/"),
              data: await readFile(path),
            });
          }
        }
      };
      await visit(this.root);
      return entries;
    });
  }

  private directoryForCollection(collectionId: string | null): string {
    if (collectionId === "trash") return join(this.root, METADATA_DIRECTORY, "trash");
    if (!collectionId) return this.root;
    const collection = this.collections.get(collectionId);
    if (!collection) throw new Error("Collection not found");
    return join(this.root, collection.path);
  }

  private orderFor(collectionId: string | null): string[] {
    if (collectionId === "trash") return this.manifest.trashOrder;
    if (!collectionId) return this.manifest.unfiledOrder;
    return this.collections.get(collectionId)?.canvasOrder ?? [];
  }

  private async writeOrder(collectionId: string | null, order: string[]): Promise<void> {
    if (collectionId === "trash") this.manifest.trashOrder = order;
    else if (!collectionId) this.manifest.unfiledOrder = order;
    else {
      const collection = this.collections.get(collectionId);
      if (!collection) throw new Error("Collection not found");
      collection.canvasOrder = order;
      collection.updatedAt = nowIso();
      await atomicWorkspaceWrite(
        this.root,
        join(this.root, collection.path, PROJECT_FILE),
        serialize(this.projectManifest(collection)),
      );
      return;
    }
    this.manifest.updatedAt = nowIso();
    await atomicWorkspaceWrite(
      this.root,
      join(this.root, WORKSPACE_MANIFEST),
      serialize(this.manifest),
    );
  }

  private async appendOrder(collectionId: string | null, id: string): Promise<void> {
    await this.writeOrder(collectionId, [...this.orderFor(collectionId), id]);
  }

  private async removeOrder(collectionId: string | null, id: string): Promise<void> {
    await this.writeOrder(collectionId, this.orderFor(collectionId).filter((item) => item !== id));
  }

  private placementOrder(collectionId: string | null) {
    return {
      collectionId,
      items: this.orderFor(collectionId).map((id, sortOrder) => ({ id, sortOrder })),
    };
  }

  private async writeSnapshot(record: DrawingRecord): Promise<void> {
    const snapshotId = randomUUID();
    const createdAt = nowIso();
    const directory = join(this.root, METADATA_DIRECTORY, "history", record.id);
    const filename = `${String(record.version).padStart(8, "0")}-${Date.now()}-${snapshotId}.excalidraw`;
    await atomicWorkspaceWrite(
      this.root,
      join(directory, filename),
      serialize(this.documentFor(record, snapshotId, createdAt)),
    );
  }

  private async pruneHistory(): Promise<void> {
    const root = join(this.root, METADATA_DIRECTORY, "history");
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    for (const directory of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!directory.isDirectory()) continue;
      const path = join(root, directory.name);
      for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isFile() || !entry.name.endsWith(".excalidraw")) continue;
        const info = await stat(join(path, entry.name)).catch(() => null);
        if (info && info.mtimeMs < cutoff) await rm(join(path, entry.name), { force: true });
      }
    }
  }
}
