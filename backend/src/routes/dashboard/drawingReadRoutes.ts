import express from "express";
import { canViewDrawing, getDrawingAccess } from "../../authz/drawingAccess";
import { toPublicTrashCollectionId } from "./trash";
import type { DrawingRouteContext } from "./drawingRouteContext";

export const registerDrawingReadRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    parseJsonField,
    getRequestPrincipal,
    respondWithAuthErrorIfPresent,
  } = context;
  app.get(
    "/drawings/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const principal = await getRequestPrincipal(req);

      const { id } = req.params;
      const access = await getDrawingAccess({
        prisma,
        principal,
        drawingId: id,
      });
      if (!canViewDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      const drawing = await prisma.drawing.findUnique({ where: { id } });
      if (!drawing) {
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      return res.json({
        ...drawing,
        collectionId: toPublicTrashCollectionId(drawing.collectionId, drawing.userId),
        elements: parseJsonField(drawing.elements, []),
        appState: parseJsonField(drawing.appState, {}),
        files: parseJsonField(drawing.files, {}),
        accessLevel: access,
      });
    }),
  );

};
