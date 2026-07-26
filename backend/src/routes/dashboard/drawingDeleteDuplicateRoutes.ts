import express from "express";
import { randomUUID as uuidv4 } from "crypto";
import { rewritePreviewForS3 } from "../../fileProcessing";
import {
  getUserTrashCollectionId,
  isTrashCollectionId,
  toPublicTrashCollectionId,
} from "./trash";
import type { DrawingRouteContext } from "./drawingRouteContext";
import {
  getNextSortOrder,
  normalizeDrawingOrder,
  placeDrawing,
} from "./drawingOrdering";

export const registerDrawingDeleteDuplicateRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    ensureTrashCollection,
    invalidateDrawingsCache,
    config,
    logAuditEvent,
    parseJsonField,
    cleanupS3FilesForDrawing,
    cloneS3FileReferences,
  } = context;
  app.delete(
    "/drawings/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;

      const drawing = await prisma.drawing.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!drawing) return res.status(404).json({ error: "Drawing not found" });

      const deleteResult = await prisma.$transaction(async (tx) => {
        const result = await tx.drawing.deleteMany({
          where: { id, userId: req.user!.id },
        });
        await normalizeDrawingOrder(tx, drawing.collectionId, req.user!.id);
        return result;
      });
      if (deleteResult.count === 0) {
        return res.status(404).json({ error: "Drawing not found" });
      }
      try {
        await cleanupS3FilesForDrawing(id, req.user.id);
      } catch (error) {
        console.warn("[s3] Failed to cleanup deleted drawing files", { drawingId: id, error });
      }
      invalidateDrawingsCache();

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: req.user.id,
          action: "drawing_deleted",
          resource: `drawing:${id}`,
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { drawingId: id, drawingName: drawing.name },
        });
      }

      return res.json({ success: true });
    }),
  );

  app.post(
    "/drawings/:id/duplicate",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const original = await prisma.drawing.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!original)
        return res.status(404).json({ error: "Original drawing not found" });
      let duplicatedCollectionId = original.collectionId;
      if (isTrashCollectionId(original.collectionId, req.user.id)) {
        await ensureTrashCollection(prisma, req.user.id);
        duplicatedCollectionId = getUserTrashCollectionId(req.user.id);
      }

      const newDrawingId = uuidv4();
      const originalFiles = parseJsonField<Record<string, any>>(original.files, {});
      const duplicatedFiles = await cloneS3FileReferences(
        original.id,
        newDrawingId,
        req.user.id,
        originalFiles,
      );
      const duplicatedPreview = rewritePreviewForS3(
        original.preview ?? null,
        originalFiles,
        duplicatedFiles,
      );

      const newDrawing = await prisma.$transaction(async (tx) => {
        const siblings = await tx.drawing.findMany({
          where: { collectionId: duplicatedCollectionId, userId: req.user!.id },
          select: { id: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        });
        const sourceIndex = siblings.findIndex((drawing) => drawing.id === original.id);
        const sortOrder = await getNextSortOrder(
          tx,
          duplicatedCollectionId,
          req.user!.id,
        );
        const created = await tx.drawing.create({
          data: {
            id: newDrawingId,
            name: `${original.name} (Copy)`,
            elements: original.elements,
            appState: original.appState,
            files: JSON.stringify(duplicatedFiles),
            preview: typeof duplicatedPreview === "string" ? duplicatedPreview : original.preview,
            userId: req.user!.id,
            collectionId: duplicatedCollectionId,
            sortOrder,
            version: 1,
          },
        });
        await placeDrawing(
          tx,
          created,
          duplicatedCollectionId,
          sourceIndex >= 0 ? sourceIndex + 1 : siblings.length,
        );
        return tx.drawing.findUniqueOrThrow({ where: { id: created.id } });
      });
      invalidateDrawingsCache();

      return res.json({
        ...newDrawing,
        collectionId: toPublicTrashCollectionId(
          newDrawing.collectionId,
          req.user.id,
        ),
        elements: parseJsonField(newDrawing.elements, []),
        appState: parseJsonField(newDrawing.appState, {}),
        files: parseJsonField(newDrawing.files, {}),
      });
    }),
  );

};
