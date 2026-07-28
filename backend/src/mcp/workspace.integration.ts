import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestPrisma, setupTestDb } from "../__tests__/testUtils";
import { McpWorkspace, McpWorkspaceError } from "./workspace";

describe("MCP workspace persistence", () => {
  const prisma = getTestPrisma();
  const userId = "mcp-workspace-user";
  const emit = vi.fn();
  const io = { to: vi.fn(() => ({ emit })) } as any;
  const invalidateDrawingsCache = vi.fn();
  let workspace: McpWorkspace;

  beforeAll(async () => {
    setupTestDb();
    await prisma.user.create({
      data: {
        id: userId,
        email: "mcp-workspace@test.local",
        passwordHash: "",
        name: "MCP User",
        isActive: true,
      },
    });
    workspace = new McpWorkspace(userId, { prisma, io, invalidateDrawingsCache });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists atomic patches, snapshots, version conflicts, and editor notifications", async () => {
    const canvas = await workspace.createCanvas({ name: "Architecture" }) as any;
    const result = await workspace.applyCanvasPatch({
      canvasId: canvas.id,
      expectedVersion: 1,
      create: [
        { id: "api", type: "rectangle", x: 100, y: 100, text: "API" },
        { id: "db", type: "ellipse", x: 420, y: 100, text: "DB" },
        { id: "edge", type: "arrow", x: 0, y: 0, startElementId: "api", endElementId: "db" },
      ],
    });

    expect(result.version).toBe(2);
    expect(result.createdIds).toEqual(["api", "db", "edge"]);
    expect(await prisma.drawingSnapshot.count({ where: { drawingId: canvas.id } })).toBe(1);
    expect(emit).toHaveBeenCalledWith("drawing-server-update", { drawingId: canvas.id });

    await expect(workspace.applyCanvasPatch({
      canvasId: canvas.id,
      expectedVersion: 1,
      update: [{ id: "api", x: 200 }],
    })).rejects.toMatchObject<McpWorkspaceError>({ code: "CONFLICT" });

    const stored = await prisma.drawing.findUniqueOrThrow({ where: { id: canvas.id } });
    expect(JSON.parse(stored.elements).find((element: any) => element.id === "api").x).toBe(100);
  });

  it("requires Trash before permanent canvas deletion", async () => {
    const canvas = await workspace.createCanvas({ name: "Disposable" }) as any;
    await expect(workspace.permanentlyDeleteCanvas(canvas.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await workspace.moveCanvasToTrash(canvas.id);
    await workspace.permanentlyDeleteCanvas(canvas.id);
    expect(await prisma.drawing.findUnique({ where: { id: canvas.id } })).toBeNull();
  });
});
