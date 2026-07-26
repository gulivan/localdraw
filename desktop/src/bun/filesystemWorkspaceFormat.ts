import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const SETTINGS_FILE = "workspace-settings.json";
export const INDEX_PATH = ".localdraw/workspace.json";
export const PROJECT_FILE = ".localdraw-project.json";
export const FORMAT_VERSION = 1;
export const BOOTSTRAP_USER_ID = "bootstrap-admin";

export type JsonRecord = Record<string, unknown>;

export type CollectionRow = {
  id: string;
  name: string;
  color: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SnapshotRow = {
  id: string;
  drawingId: string;
  version: number;
  elements: string;
  appState: string;
  files: string;
  createdAt: Date;
};

export type DrawingRow = {
  id: string;
  name: string;
  elements: string;
  appState: string;
  files: string;
  version: number;
  collectionId: string | null;
  sortOrder: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  snapshots: SnapshotRow[];
};

export type WorkspacePrisma = {
  user: { upsert(args: unknown): Promise<unknown> };
  collection: {
    findMany(args: unknown): Promise<CollectionRow[]>;
    findUnique(args: unknown): Promise<CollectionRow | null>;
    upsert(args: unknown): Promise<CollectionRow>;
  };
  drawing: {
    findMany(args: unknown): Promise<DrawingRow[]>;
    findUnique(args: unknown): Promise<DrawingRow | null>;
    create(args: unknown): Promise<DrawingRow>;
    update(args: unknown): Promise<DrawingRow>;
  };
  drawingSnapshot: {
    findUnique(args: unknown): Promise<SnapshotRow | null>;
    create(args: unknown): Promise<SnapshotRow>;
  };
};

export type WorkspaceIndex = {
  formatVersion: number;
  drawings: Record<string, { path: string; hash: string }>;
  projects: Record<string, { path: string; hash?: string }>;
  syncedAt: string;
};

export type ExcalidrawDocument = {
  type: "excalidraw";
  version: number;
  source: string;
  elements: unknown[];
  appState: JsonRecord;
  files: JsonRecord;
  localdraw: {
    id: string;
    name: string;
    version: number;
    collectionId: string | null;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
    snapshotId?: string;
  };
};

export const emptyIndex = (): WorkspaceIndex => ({
  formatVersion: FORMAT_VERSION,
  drawings: {},
  projects: {},
  syncedAt: new Date(0).toISOString(),
});

export const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const asJsonRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};

export const documentForDrawing = (drawing: DrawingRow): ExcalidrawDocument => ({
  type: "excalidraw",
  version: 2,
  source: "https://github.com/ZimengXiong/ExcaliDash",
  elements: parseJson(drawing.elements, []),
  appState: parseJson(drawing.appState, {}),
  files: parseJson(drawing.files, {}),
  localdraw: {
    id: drawing.id,
    name: drawing.name,
    version: drawing.version,
    collectionId: drawing.collectionId,
    sortOrder: drawing.sortOrder,
    createdAt: drawing.createdAt.toISOString(),
    updatedAt: drawing.updatedAt.toISOString(),
  },
});

export const documentForSnapshot = (
  drawing: DrawingRow,
  snapshot: SnapshotRow,
): ExcalidrawDocument => ({
  ...documentForDrawing(drawing),
  elements: parseJson(snapshot.elements, []),
  appState: parseJson(snapshot.appState, {}),
  files: parseJson(snapshot.files, {}),
  localdraw: {
    ...documentForDrawing(drawing).localdraw,
    version: snapshot.version,
    updatedAt: snapshot.createdAt.toISOString(),
    snapshotId: snapshot.id,
  },
});

export const slug = (value: string, fallback: string): string => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .trim()
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return normalized || fallback;
};

export const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const serialize = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

export const atomicWrite = async (
  path: string,
  contents: string,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      process.platform !== "win32" ||
      (code !== "EEXIST" && code !== "EPERM")
    ) {
      throw error;
    }
    await copyFile(temporary, path);
    await rm(temporary, { force: true });
  }
};

export const atomicWorkspaceWrite = async (
  root: string,
  path: string,
  contents: string,
): Promise<void> => {
  await assertWorkspacePath(root, path);
  await atomicWrite(path, contents);
};

export const expandHome = (path: string): string =>
  path === "~" || path.startsWith(`~${sep}`)
    ? join(homedir(), path.slice(2))
    : path;

export const resolveWorkspaceRoot = (value: string): string => {
  const expanded = expandHome(value.trim());
  if (!expanded || !isAbsolute(expanded)) {
    throw new Error("Workspace path must be absolute");
  }
  const resolved = resolve(expanded);
  if (resolved === resolve(sep)) {
    throw new Error("Filesystem root cannot be a workspace");
  }
  return resolved;
};

export const isInside = (root: string, candidate: string): boolean => {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

export const assertWorkspacePath = async (
  root: string,
  candidate: string,
): Promise<void> => {
  if (!isInside(root, candidate)) throw new Error("Workspace path escaped its root");
  let current = root;
  for (const part of relative(root, candidate).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current).catch(() => null);
    if (info?.isSymbolicLink()) {
      throw new Error("Workspace paths cannot contain symbolic links");
    }
  }
};

export const listDrawingFiles = async (root: string): Promise<string[]> => {
  const found: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    );
    for (const entry of entries) {
      if (entry.name === ".localdraw") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".excalidraw")) {
        found.push(path);
      }
    }
  };
  await visit(root);
  return found;
};
