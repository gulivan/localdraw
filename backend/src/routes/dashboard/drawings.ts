import express from "express";
import { DashboardRouteDeps } from "./types";
import { createDrawingRouteContext } from "./drawingRouteContext";
import { registerDrawingListRoutes } from "./drawingListRoutes";
import { registerDrawingReadRoutes } from "./drawingReadRoutes";
import { registerDrawingCreateUpdateRoutes } from "./drawingCreateUpdateRoutes";
import { registerDrawingDeleteDuplicateRoutes } from "./drawingDeleteDuplicateRoutes";
import { registerDrawingSharingRoutes } from "./drawingSharingRoutes";
import { registerDrawingHistoryRoutes } from "./drawingHistoryRoutes";
import { registerDrawingPlacementRoutes } from "./drawingPlacementRoutes";

export const registerDrawingRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
) => {
  const context = createDrawingRouteContext(deps);

  registerDrawingListRoutes(app, context);
  registerDrawingReadRoutes(app, context);
  registerDrawingCreateUpdateRoutes(app, context);
  registerDrawingPlacementRoutes(app, context);
  registerDrawingDeleteDuplicateRoutes(app, context);
  registerDrawingSharingRoutes(app, context);
  registerDrawingHistoryRoutes(app, context);
};
