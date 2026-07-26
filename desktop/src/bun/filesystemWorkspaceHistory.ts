import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  parseJson,
  type ExcalidrawDocument,
  type WorkspacePrisma,
} from "./filesystemWorkspaceFormat";

const safeId = (value: string | undefined): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/.test(value);
const SNAPSHOT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

export const importWorkspaceHistory = async (
  prisma: WorkspacePrisma,
  root: string,
): Promise<void> => {
  const historyRoot = join(root, ".localdraw", "history");
  for (const drawingEntry of await readdir(historyRoot, {
    withFileTypes: true,
  }).catch(() => [])) {
    if (!drawingEntry.isDirectory() || !safeId(drawingEntry.name)) continue;
    const drawingId = drawingEntry.name;
    if (!await prisma.drawing.findUnique({ where: { id: drawingId } })) continue;

    const directory = join(historyRoot, drawingId);
    for (const entry of await readdir(directory, {
      withFileTypes: true,
    }).catch(() => [])) {
      if (!entry.isFile() || !entry.name.endsWith(".excalidraw")) continue;
      const snapshotPath = join(directory, entry.name);
      const fileSize = (await stat(snapshotPath).catch(() => null))?.size ?? 0;
      if (fileSize <= 0 || fileSize > 50 * 1024 * 1024) continue;
      const parsed = parseJson<Partial<ExcalidrawDocument>>(
        await readFile(snapshotPath, "utf8").catch(() => ""),
        {},
      );
      const snapshotId = parsed.localdraw?.snapshotId;
      if (
        !safeId(snapshotId) ||
        await prisma.drawingSnapshot.findUnique({ where: { id: snapshotId } })
      ) {
        continue;
      }
      const createdAt = new Date(parsed.localdraw?.updatedAt || "");
      if (
        !Number.isNaN(createdAt.getTime()) &&
        createdAt.getTime() < Date.now() - SNAPSHOT_RETENTION_MS
      ) {
        continue;
      }
      await prisma.drawingSnapshot.create({
        data: {
          id: snapshotId,
          drawingId,
          version: parsed.localdraw?.version ?? 1,
          elements: JSON.stringify(parsed.elements ?? []),
          appState: JSON.stringify(parsed.appState ?? {}),
          files: JSON.stringify(parsed.files ?? {}),
          ...(Number.isNaN(createdAt.getTime()) ? {} : { createdAt }),
        },
      });
    }
  }
};
