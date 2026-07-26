import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  BOOTSTRAP_USER_ID,
  digest,
  parseJson,
  PROJECT_FILE,
  type WorkspaceIndex,
  type WorkspacePrisma,
} from "./filesystemWorkspaceFormat";

export type ProjectDirectory = {
  id: string;
  slideOrder: string[];
  changed: boolean;
};

export const readProjectDirectories = async (
  prisma: WorkspacePrisma,
  root: string,
  index: WorkspaceIndex,
): Promise<Map<string, ProjectDirectory>> => {
  const result = new Map<string, ProjectDirectory>();
  const projectsRoot = join(root, "projects");
  for (const entry of await readdir(projectsRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const directory = join("projects", entry.name);
    const contents = await readFile(
      join(root, directory, PROJECT_FILE),
      "utf8",
    ).catch(() => "");
    const manifest = parseJson<{
      id?: string;
      name?: string;
      color?: string;
      slideOrder?: string[];
    }>(contents, {});
    if (!manifest.id || !/^[a-zA-Z0-9:_-]{1,128}$/.test(manifest.id)) continue;
    const previous = index.projects[manifest.id];
    const hash = digest(contents);
    const changed = previous?.hash !== hash;
    const name = manifest.name || entry.name;
    const color = manifest.color || "#7c3aed";
    const existing = await prisma.collection.findUnique({ where: { id: manifest.id } });
    if (!existing && !changed) continue;
    if (!existing || (changed && (existing.name !== name || existing.color !== color))) {
      await prisma.collection.upsert({
        where: { id: manifest.id },
        update: { name, color },
        create: { id: manifest.id, name, color, userId: BOOTSTRAP_USER_ID },
      });
    }
    index.projects[manifest.id] = { path: directory, hash };
    result.set(directory, {
      id: manifest.id,
      slideOrder: Array.isArray(manifest.slideOrder) ? manifest.slideOrder : [],
      changed,
    });
  }
  return result;
};
