export interface DrawingSummary {
  id: string;
  name: string;
  collectionId: string | null;
  updatedAt: number;
  createdAt: number;
  version: number;
  sortOrder?: number;
  preview?: string | null;
  accessLevel?: "none" | "view" | "edit" | "owner";
  creatorName?: string | null;
}
export interface Drawing extends DrawingSummary {
  elements: any[];
  appState: any;
  files: Record<string, any> | null;
}
export interface Collection {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
  updatedAt?: number;
  drawingCount?: number;
  lastActivityAt?: number;
  latestDrawing?: Pick<
    DrawingSummary,
    "id" | "name" | "preview" | "sortOrder" | "updatedAt"
  > | null;
  initialDrawingId?: string;
  initialDrawing?: Pick<DrawingSummary, "id" | "updatedAt">;
}

export interface DrawingPlacementOrder {
  collectionId: string | null;
  items: Array<{ id: string; sortOrder: number }>;
}
