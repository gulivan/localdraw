import express from "express";
import { z } from "zod";
import type { DrawingRouteContext } from "./drawingRouteContext";
import { placeDrawing } from "./drawingOrdering";

const placementSchema = z.object({
  collectionId: z.string().trim().min(1).nullable(),
  targetIndex: z.number().int().min(0),
});

export const registerDrawingPlacementRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const { prisma, requireAuth, asyncHandler, invalidateDrawingsCache } = context;
  app.patch(
    "/drawings/:id/placement",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = placementSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid canvas placement" });
      }
      const drawing = await prisma.drawing.findUnique({
        where: { id: req.params.id },
        select: { id: true, userId: true, collectionId: true },
      });
      if (!drawing || drawing.userId !== req.user.id) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const targetCollectionId = parsed.data.collectionId;
      if (targetCollectionId) {
        const target = await prisma.collection.findFirst({
          where: { id: targetCollectionId, userId: req.user.id },
        });
        if (!target) return res.status(404).json({ error: "Collection not found" });
      }

      const result = await prisma.$transaction((tx) =>
        placeDrawing(tx, drawing, targetCollectionId, parsed.data.targetIndex),
      );
      invalidateDrawingsCache();
      return res.json({
        drawing: {
          id: drawing.id,
          collectionId: result.collectionId,
          sortOrder: result.sortOrder,
        },
        orders: result.orders,
      });
    }),
  );
};
