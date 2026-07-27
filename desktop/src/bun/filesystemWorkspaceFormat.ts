import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const FORMAT_VERSION = 2;
export const SETTINGS_FILE = "workspace-settings.json";
export const METADATA_DIRECTORY = ".localdraw";
export const WORKSPACE_MANIFEST = `${METADATA_DIRECTORY}/manifest.json`;
export const INDEX_PATH = `${METADATA_DIRECTORY}/index.json`;
export const PROJECT_FILE = ".localdraw-project.json";
export const MAX_DRAWING_BYTES = 50 * 1024 * 1024;

export type JsonRecord = Record<string, unknown>;

export type LocaldrawMetadata = {
  id: string;
  name: string;
  version: number;
  collectionId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  snapshotId?: string;
};

export type ExcalidrawDocument = {
  type: "excalidraw";
  version: number;
  source?: string;
  elements: unknown[];
  appState: JsonRecord;
  files: JsonRecord;
  localdraw?: LocaldrawMetadata;
};

export type DrawingRecord = {
  id: string;
  name: string;
  collectionId: string | null;
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  preview: string | null;
  elements: unknown[];
  appState: JsonRecord;
  files: JsonRecord;
  path: string;
  digest: string;
  searchText: string;
};

export type CollectionRecord = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  path: string;
  canvasOrder: string[];
};

export type WorkspaceManifest = {
  formatVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  unfiledOrder: string[];
  trashOrder: string[];
};

export type ProjectManifest = {
  formatVersion: number;
  id: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  canvasOrder: string[];
};

export const nowIso = (): string => new Date().toISOString();

export const emptyWorkspaceManifest = (): WorkspaceManifest => {
  const now = nowIso();
  return {
    formatVersion: FORMAT_VERSION,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    unfiledOrder: [],
    trashOrder: [],
  };
};

export const emptyProjectManifest = (): ProjectManifest => {
  const now = nowIso();
  return {
    formatVersion: FORMAT_VERSION,
    id: randomUUID(),
    color: "#7c3aed",
    createdAt: now,
    updatedAt: now,
    canvasOrder: [],
  };
};

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

export const serialize = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

export const digest = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

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
  if (resolved === resolve(sep)) throw new Error("Filesystem root cannot be a workspace");
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
    if (info?.isSymbolicLink()) throw new Error("Workspace paths cannot contain symbolic links");
  }
};

export const atomicWrite = async (path: string, contents: string | Uint8Array) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" || (code !== "EEXIST" && code !== "EPERM")) {
      await rm(temporary, { force: true });
      throw error;
    }
    await copyFile(temporary, path);
    await rm(temporary, { force: true });
  }
  try {
    const finalHandle = await open(path, "r");
    try {
      await finalHandle.sync();
    } finally {
      await finalHandle.close();
    }
    const directoryHandle = await open(dirname(path), "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch {
    // Some Windows filesystems do not allow directory handles to be synced.
  }
};

export const atomicWorkspaceWrite = async (
  root: string,
  path: string,
  contents: string | Uint8Array,
) => {
  await assertWorkspacePath(root, path);
  await atomicWrite(path, contents);
};

export const slug = (value: string, fallback: string): string => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_")
    .trim()
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 100);
  return normalized || fallback;
};

export const uniquePath = async (
  directory: string,
  name: string,
  extension: string,
  currentPath?: string,
): Promise<string> => {
  const base = slug(name, "Untitled");
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? "" : ` (${index})`;
    const candidate = join(directory, `${base}${suffix}${extension}`);
    if (currentPath && resolve(candidate) === resolve(currentPath)) return candidate;
    if (!(await lstat(candidate).catch(() => null))) return candidate;
  }
  throw new Error("Could not allocate a unique workspace path");
};

export const drawingNameFromPath = (path: string): string =>
  basename(path, ".excalidraw").trim() || "Untitled";

export const searchableText = (name: string, elements: unknown[]): string => {
  const texts: string[] = [name];
  const visit = (value: unknown): void => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["text", "originalText", "label", "title"]) {
        if (typeof record[key] === "string") texts.push(record[key] as string);
      }
    }
  };
  elements.forEach(visit);
  return texts.join(" ").toLocaleLowerCase();
};

export const listExcalidrawFiles = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".excalidraw"))
    .map((entry) => join(directory, entry.name));
