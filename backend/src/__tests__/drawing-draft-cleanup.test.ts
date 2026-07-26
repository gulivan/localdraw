import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerDrawingDeleteDuplicateRoutes } from "../routes/dashboard/drawingDeleteDuplicateRoutes";

const userId = "user-1";
const drawingId = "drawing-1";
const updatedAt = new Date("2026-07-27T10:00:00.000Z");

const buildApp = () => {
  const transactionDrawing = {
    deleteMany: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  };
  const prisma = {
    drawing: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ drawing: transactionDrawing }),
    ),
  };
  const cleanupS3FilesForDrawing = vi.fn().mockResolvedValue(undefined);
  const invalidateDrawingsCache = vi.fn();
  const app = express();
  app.use((req: any, _res, next) => {
    req.user = { id: userId, role: "USER" };
    next();
  });
  registerDrawingDeleteDuplicateRoutes(app, {
    prisma,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    asyncHandler: (handler: any) => (req: any, res: any, next: any) =>
      Promise.resolve(handler(req, res, next)).catch(next),
    ensureTrashCollection: vi.fn(),
    invalidateDrawingsCache,
    config: { enableAuditLogging: false },
    logAuditEvent: vi.fn(),
    parseJsonField: vi.fn(),
    cleanupS3FilesForDrawing,
    cloneS3FileReferences: vi.fn(),
  } as any);
  return {
    app,
    cleanupS3FilesForDrawing,
    invalidateDrawingsCache,
    prisma,
    transactionDrawing,
  };
};

describe("untouched drawing cleanup", () => {
  let setup: ReturnType<typeof buildApp>;

  beforeEach(() => {
    setup = buildApp();
    setup.prisma.drawing.findFirst.mockResolvedValue({
      id: drawingId,
      userId,
      name: "Untitled Canvas",
      collectionId: null,
      updatedAt,
    });
  });

  it("deletes only the original empty version of a new drawing", async () => {
    setup.transactionDrawing.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(setup.app)
      .delete(`/drawings/${drawingId}`)
      .query({
        ifUntouched: "true",
        expectedUpdatedAt: updatedAt.toISOString(),
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, deleted: true });
    expect(setup.transactionDrawing.deleteMany).toHaveBeenCalledWith({
      where: {
        id: drawingId,
        userId,
        version: 1,
        updatedAt,
        elements: "[]",
        files: "{}",
        preview: null,
      },
    });
    expect(setup.cleanupS3FilesForDrawing).toHaveBeenCalledWith(
      drawingId,
      userId,
    );
    expect(setup.invalidateDrawingsCache).toHaveBeenCalledOnce();
  });

  it("keeps a drawing when its server state no longer matches", async () => {
    setup.transactionDrawing.deleteMany.mockResolvedValue({ count: 0 });

    const response = await request(setup.app)
      .delete(`/drawings/${drawingId}`)
      .query({
        ifUntouched: "true",
        expectedUpdatedAt: updatedAt.toISOString(),
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, deleted: false });
    expect(setup.cleanupS3FilesForDrawing).not.toHaveBeenCalled();
    expect(setup.invalidateDrawingsCache).not.toHaveBeenCalled();
  });
});
