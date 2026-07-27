import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  FileConflictError,
  FilesystemWorkspace,
} from "../src/bun/filesystemWorkspace";
import { createLocalApi } from "../src/bun/localApi";
import {
  compareDesktopVersions,
  parseDesktopReleaseVersion,
  pickLatestDesktopRelease,
} from "../src/bun/desktopUpdates";

const fixtureRoot = resolve(tmpdir(), `localdraw-files-${randomUUID()}`);
const dataDir = join(fixtureRoot, "app-data");
const workspacePath = join(fixtureRoot, "workspace");
const movedWorkspacePath = join(fixtureRoot, "moved-workspace");
const externalWorkspacePath = join(fixtureRoot, "external-workspace");

mkdirSync(fixtureRoot, { recursive: true });

const currentRelease = parseDesktopReleaseVersion("v0.6.0-desktop");
const laterRelease = parseDesktopReleaseVersion("v0.6.1-desktop");
assert.ok(currentRelease);
assert.ok(laterRelease);
assert.equal(compareDesktopVersions(laterRelease, currentRelease) > 0, true);
assert.equal(
  pickLatestDesktopRelease([
    { tag_name: "v0.6.2-beta.1-desktop", prerelease: true },
    { tag_name: "v0.6.1-desktop", html_url: "stable", prerelease: false },
    { tag_name: "v0.5.11-desktop", html_url: "old", prerelease: false },
  ], "stable")?.html_url,
  "stable",
);

const drawingPathFromIndex = (root: string, id: string): string => {
  const index = JSON.parse(
    readFileSync(join(root, ".localdraw/index.json"), "utf8"),
  );
  return join(root, index.drawings[id].path);
};

const workspace = new FilesystemWorkspace(dataDir, workspacePath);

try {
  await workspace.initialize();
  const project = await workspace.createCollection("Roadmap", "#7c3aed", true);
  assert.equal(project.name, "Roadmap");
  assert.ok(project.initialDrawing?.id);

  const drawingId = project.initialDrawing!.id;
  const initial = workspace.getDrawing(drawingId)!;
  const saved = await workspace.updateDrawing(drawingId, {
    elements: [{ id: "shape-1", type: "rectangle", text: "filesystem search" }],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
    version: initial.version,
  });
  assert.equal(saved.version, 2);
  assert.equal(workspace.listDrawings({ search: "filesystem" }).totalCount, 1);

  const drawingPath = drawingPathFromIndex(workspacePath, drawingId);
  assert.equal(existsSync(drawingPath), true);
  const external = JSON.parse(readFileSync(drawingPath, "utf8"));
  external.elements.push({ id: "external", type: "ellipse" });
  writeFileSync(drawingPath, `${JSON.stringify(external, null, 2)}\n`);
  await workspace.rescan();
  assert.equal(workspace.getDrawing(drawingId)?.version, 3);
  assert.equal((workspace.getDrawing(drawingId)?.elements as any[]).at(-1).id, "external");
  assert.equal((await workspace.listHistory(drawingId)).totalCount >= 2, true);

  const renamedPath = join(resolve(drawingPath, ".."), "Opening renamed.excalidraw");
  await Bun.write(renamedPath, Bun.file(drawingPath));
  rmSync(drawingPath);
  await workspace.rescan();
  assert.equal(workspace.getDrawing(drawingId)?.name, "Opening renamed");

  const beforeConflict = workspace.getDrawing(drawingId)!;
  const conflictDisk = JSON.parse(readFileSync(renamedPath, "utf8"));
  conflictDisk.elements.push({ id: "disk", type: "diamond" });
  writeFileSync(renamedPath, `${JSON.stringify(conflictDisk, null, 2)}\n`);
  await assert.rejects(
    () => workspace.updateDrawing(drawingId, {
      elements: [...beforeConflict.elements, { id: "local", type: "line" }],
      version: beforeConflict.version,
    }),
    (error: unknown) => {
      assert.ok(error instanceof FileConflictError);
      assert.equal(existsSync(join(workspacePath, error.conflictPath)), true);
      return true;
    },
  );
  await workspace.rescan();

  const copiedPath = join(resolve(renamedPath, ".."), "Opening copied.excalidraw");
  await Bun.write(copiedPath, Bun.file(renamedPath));
  await workspace.rescan();
  const copiedRows = workspace.listDrawings({
    collectionId: project.id,
    includeData: true,
  }).drawings;
  assert.equal(copiedRows.length, 2);
  assert.equal(new Set(copiedRows.map((item) => item.id)).size, 2);
  assert.equal(workspace.getDrawing(drawingId)?.name, "Opening renamed");

  cpSync(resolve(renamedPath, ".."), join(workspacePath, "Roadmap Copy"), {
    recursive: true,
  });
  await workspace.rescan();
  const copiedProjects = workspace.listCollections().filter((item) => item.id !== "trash");
  assert.equal(copiedProjects.length, 2);
  const allProjectDrawings = workspace.listDrawings({ includeData: true }).drawings;
  assert.equal(new Set(allProjectDrawings.map((item) => item.id)).size, allProjectDrawings.length);

  await workspace.updatePreferences({ theme: "dark", recentCanvasesLimit: 8 });
  assert.equal((await workspace.getPreferences()).theme, "dark");
  await workspace.updateLibrary([{ id: "library-item" }]);
  assert.equal((await workspace.getLibrary()).length, 1);

  rmSync(join(workspacePath, ".localdraw/index.json"));
  await workspace.rescan();
  assert.equal(existsSync(join(workspacePath, ".localdraw/index.json")), true);
  assert.equal(workspace.getDrawing(drawingId)?.id, drawingId);

  const invalidWorkspacePath = join(fixtureRoot, "not-a-directory");
  writeFileSync(invalidWorkspacePath, "not a workspace");
  await assert.rejects(() => workspace.openRoot(invalidWorkspacePath));
  assert.equal(workspace.getStatus().path, workspacePath);

  const unrelatedPath = join(resolve(renamedPath, ".."), "project-notes.txt");
  writeFileSync(unrelatedPath, "keep me in the source folder");

  mkdirSync(movedWorkspacePath);
  await workspace.moveRoot(movedWorkspacePath);
  assert.equal(workspace.getStatus().path, movedWorkspacePath);
  assert.equal(workspace.getDrawing(drawingId)?.id, drawingId);
  assert.equal(existsSync(join(dataDir, "excalidash.db")), false);
  assert.equal(existsSync(unrelatedPath), true);
  assert.equal(
    existsSync(join(movedWorkspacePath, relative(workspacePath, unrelatedPath))),
    false,
  );

  mkdirSync(externalWorkspacePath);
  writeFileSync(
    join(externalWorkspacePath, "Loose canvas.excalidraw"),
    `${JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [{ id: "loose", type: "text", text: "Loose" }],
      appState: {},
      files: {},
    }, null, 2)}\n`,
  );
  await workspace.openRoot(externalWorkspacePath);
  const loose = workspace.listDrawings({ includeData: true });
  assert.equal(loose.totalCount, 1);
  assert.equal(loose.drawings[0].name, "Loose canvas");
  assert.ok(JSON.parse(
    readFileSync(join(externalWorkspacePath, "Loose canvas.excalidraw"), "utf8"),
  ).localdraw.id);

  const api = createLocalApi(workspace, "test-version");
  const listResponse = await api(new Request("http://localhost/api/drawings?includeData=true"));
  assert.equal(listResponse?.status, 200);
  assert.equal((await listResponse!.json()).drawings[0].id, loose.drawings[0].id);
  const createResponse = await api(new Request("http://localhost/api/drawings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "API canvas", elements: [], appState: {}, files: {} }),
  }));
  assert.equal(createResponse?.status, 200);
  assert.equal((await createResponse!.json()).version, 1);
  const unsafeDeleteResponse = await api(new Request(
    `http://localhost/api/drawings/${loose.drawings[0].id}?ifUntouched=true`,
    { method: "DELETE" },
  ));
  assert.equal(unsafeDeleteResponse?.status, 400);
  assert.ok(workspace.getDrawing(loose.drawings[0].id));
  const exportResponse = await api(new Request("http://localhost/api/export/excalidash"));
  assert.equal(exportResponse?.status, 200);
  assert.deepEqual(
    [...new Uint8Array(await exportResponse!.arrayBuffer()).slice(0, 2)],
    [0x50, 0x4b],
  );
  const originCheckedApi = createLocalApi(
    workspace,
    "test-version",
    "http://127.0.0.1:32144",
  );
  const forbiddenResponse = await originCheckedApi(new Request(
    "http://127.0.0.1:32144/api/drawings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.invalid",
      },
      body: JSON.stringify({ name: "Blocked canvas" }),
    },
  ));
  assert.equal(forbiddenResponse?.status, 403);

  const loosePath = join(externalWorkspacePath, "Loose canvas.excalidraw");
  rmSync(loosePath);
  await workspace.rescan();
  assert.equal(workspace.listDrawings().totalCount, 1);

  console.log("Desktop filesystem-native workspace smoke test passed");
} finally {
  workspace.close();
  rmSync(fixtureRoot, { recursive: true, force: true });
}
