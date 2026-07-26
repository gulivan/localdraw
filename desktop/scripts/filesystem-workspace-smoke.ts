import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FilesystemWorkspace } from "../src/bun/filesystemWorkspace";

const fixtureRoot = resolve(tmpdir(), `localdraw-workspace-${randomUUID()}`);
const databasePath = join(fixtureRoot, "localdraw.db");
const dataDir = join(fixtureRoot, "app-data");
const workspacePath = join(fixtureRoot, "workspace");
const movedWorkspacePath = join(fixtureRoot, "moved-workspace");

mkdirSync(fixtureRoot, { recursive: true });
copyFileSync(resolve(import.meta.dirname, "../build/template.db"), databasePath);
Object.assign(process.env, {
  CSRF_SECRET: "desktop-workspace-smoke-csrf-secret",
  DATABASE_URL: `file:${databasePath}`,
  DISABLE_ONBOARDING_GATE: "true",
  FRONTEND_URL: "http://127.0.0.1:32144",
  JWT_SECRET: "desktop-workspace-smoke-jwt-secret",
  NODE_ENV: "production",
  UPDATE_CHECK_OUTBOUND: "false",
});

const backend = await import("../build/backend/dist/index.js");

try {
  const user = await backend.prisma.user.create({
    data: {
      id: "bootstrap-admin",
      email: "bootstrap@excalidash.local",
      passwordHash: "",
      name: "LocalDraw",
      role: "ADMIN",
      isActive: false,
    },
  });
  const project = await backend.prisma.collection.create({
    data: { id: "project-1", name: "Roadmap", color: "#7c3aed", userId: user.id },
  });
  const drawing = await backend.prisma.drawing.create({
    data: {
      id: "drawing-1",
      name: "Opening",
      elements: "[]",
      appState: "{}",
      files: "{}",
      userId: user.id,
      collectionId: project.id,
      sortOrder: 0,
    },
  });
  await backend.prisma.drawingSnapshot.create({
    data: {
      id: "snapshot-1",
      drawingId: drawing.id,
      version: 1,
      elements: "[]",
      appState: "{}",
      files: "{}",
    },
  });

  const workspace = new FilesystemWorkspace(backend.prisma, dataDir, workspacePath);
  await workspace.initialize();
  const index = JSON.parse(
    readFileSync(join(workspacePath, ".localdraw/workspace.json"), "utf8"),
  );
  const drawingPath = join(workspacePath, index.drawings[drawing.id].path);
  const document = JSON.parse(readFileSync(drawingPath, "utf8"));
  assert.equal(document.localdraw.id, drawing.id);
  assert.equal(document.localdraw.version, 1);
  assert.equal(document.elements.length, 0);
  assert.equal(
    readFileSync(
      join(workspacePath, ".localdraw/history/drawing-1/1-snapshot-1.excalidraw"),
      "utf8",
    ).length > 0,
    true,
  );

  document.elements = [{ id: "external", type: "rectangle" }];
  writeFileSync(drawingPath, `${JSON.stringify(document, null, 2)}\n`);
  await workspace.rescan();
  const updated = await backend.prisma.drawing.findUniqueOrThrow({
    where: { id: drawing.id },
  });
  assert.equal(updated.version, 2);
  assert.equal(JSON.parse(updated.elements)[0].id, "external");
  assert.equal(
    await backend.prisma.drawingSnapshot.count({ where: { drawingId: drawing.id } }),
    2,
  );

  await backend.prisma.drawing.update({
    where: { id: drawing.id },
    data: {
      elements: JSON.stringify([{ id: "unsynced", type: "ellipse" }]),
      version: 3,
    },
  });
  await backend.prisma.collection.update({
    where: { id: project.id },
    data: { name: "Updated Roadmap" },
  });

  await workspace.setRoot(movedWorkspacePath);
  assert.equal(workspace.getStatus().path, movedWorkspacePath);
  assert.equal(
    readFileSync(join(movedWorkspacePath, ".localdraw/workspace.json"), "utf8").length > 0,
    true,
  );
  const movedIndex = JSON.parse(
    readFileSync(join(movedWorkspacePath, ".localdraw/workspace.json"), "utf8"),
  );
  const movedDocument = JSON.parse(
    readFileSync(join(movedWorkspacePath, movedIndex.drawings[drawing.id].path), "utf8"),
  );
  assert.equal(movedDocument.localdraw.version, 3);
  assert.equal(movedDocument.elements[0].id, "unsynced");
  assert.equal(
    JSON.parse(
      readFileSync(
        join(
          movedWorkspacePath,
          movedIndex.projects[project.id].path,
          ".localdraw-project.json",
        ),
        "utf8",
      ),
    ).name,
    "Updated Roadmap",
  );

  movedDocument.localdraw.name = "Renamed outside LocalDraw";
  writeFileSync(
    join(movedWorkspacePath, movedIndex.drawings[drawing.id].path),
    `${JSON.stringify(movedDocument, null, 2)}\n`,
  );
  await workspace.rescan();
  const metadataUpdate = await backend.prisma.drawing.findUniqueOrThrow({
    where: { id: drawing.id },
  });
  assert.equal(metadataUpdate.name, "Renamed outside LocalDraw");
  assert.equal(metadataUpdate.version, 3);

  const expiredHistoryPath = join(
    movedWorkspacePath,
    ".localdraw/history/drawing-1/1-snapshot-1.excalidraw",
  );
  const expiredHistory = JSON.parse(readFileSync(expiredHistoryPath, "utf8"));
  expiredHistory.localdraw.updatedAt = "2000-01-01T00:00:00.000Z";
  writeFileSync(expiredHistoryPath, `${JSON.stringify(expiredHistory, null, 2)}\n`);
  await backend.prisma.drawingSnapshot.delete({ where: { id: "snapshot-1" } });
  await workspace.rescan();
  assert.equal(
    await backend.prisma.drawingSnapshot.findUnique({ where: { id: "snapshot-1" } }),
    null,
  );
  assert.equal(existsSync(expiredHistoryPath), false);

  const disposable = await backend.prisma.drawing.create({
    data: {
      id: "drawing-delete",
      name: "Delete me",
      elements: "[]",
      appState: "{}",
      files: "{}",
      userId: user.id,
      collectionId: null,
      sortOrder: 0,
    },
  });
  await workspace.rescan();
  const beforeDeleteIndex = JSON.parse(
    readFileSync(join(movedWorkspacePath, ".localdraw/workspace.json"), "utf8"),
  );
  const disposablePath = join(
    movedWorkspacePath,
    beforeDeleteIndex.drawings[disposable.id].path,
  );
  await backend.prisma.drawing.delete({ where: { id: disposable.id } });
  await workspace.rescan();
  assert.equal(
    await backend.prisma.drawing.findUnique({ where: { id: disposable.id } }),
    null,
  );
  assert.equal(existsSync(disposablePath), false);

  const disposableProject = await backend.prisma.collection.create({
    data: {
      id: "project-delete",
      name: "Delete project",
      color: "#71717a",
      userId: user.id,
    },
  });
  await workspace.rescan();
  const beforeProjectDeleteIndex = JSON.parse(
    readFileSync(join(movedWorkspacePath, ".localdraw/workspace.json"), "utf8"),
  );
  const disposableManifest = join(
    movedWorkspacePath,
    beforeProjectDeleteIndex.projects[disposableProject.id].path,
    ".localdraw-project.json",
  );
  await backend.prisma.collection.delete({ where: { id: disposableProject.id } });
  await workspace.rescan();
  assert.equal(existsSync(disposableManifest), false);

  await backend.prisma.drawing.delete({ where: { id: drawing.id } });
  await backend.prisma.collection.delete({ where: { id: project.id } });
  const rebuiltWorkspace = new FilesystemWorkspace(
    backend.prisma,
    dataDir,
    movedWorkspacePath,
  );
  await rebuiltWorkspace.initialize();
  assert.equal(
    (await backend.prisma.drawing.findUnique({ where: { id: drawing.id } }))?.id,
    drawing.id,
  );
  assert.equal(
    await backend.prisma.drawingSnapshot.count({ where: { drawingId: drawing.id } }),
    1,
  );

  if (process.platform !== "win32") {
    const outsidePath = join(fixtureRoot, "outside");
    const linkedProjectPath = join(movedWorkspacePath, "projects", "linked");
    mkdirSync(outsidePath);
    symlinkSync(outsidePath, linkedProjectPath, "dir");
    const unsafeIndexPath = join(movedWorkspacePath, ".localdraw/workspace.json");
    const unsafeIndex = JSON.parse(readFileSync(unsafeIndexPath, "utf8"));
    rmSync(join(movedWorkspacePath, unsafeIndex.projects[project.id].path), {
      recursive: true,
      force: true,
    });
    unsafeIndex.projects[project.id].path = "projects/linked";
    writeFileSync(unsafeIndexPath, `${JSON.stringify(unsafeIndex, null, 2)}\n`);
    const unsafeWorkspace = new FilesystemWorkspace(
      backend.prisma,
      dataDir,
      movedWorkspacePath,
    );
    await assert.rejects(
      () => unsafeWorkspace.initialize(),
      /symbolic links/,
    );
    assert.equal(existsSync(join(outsidePath, ".localdraw-project.json")), false);
  }
  console.log("Desktop filesystem workspace smoke test passed");
} finally {
  await backend.prisma.$disconnect();
  rmSync(fixtureRoot, { recursive: true, force: true });
}
process.exit(0);
