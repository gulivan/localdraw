import type { PrismaClient } from "../generated/client";

export type DrawingAccess = "none" | "owner";
export type DrawingPrincipal = { kind: "user"; userId: string };

export const getDrawingAccess = async (params: {
  prisma: PrismaClient;
  principal: DrawingPrincipal | null;
  drawingId: string;
}): Promise<DrawingAccess> => {
  if (params.principal?.kind !== "user") return "none";
  const drawing = await params.prisma.drawing.findFirst({
    where: {
      id: params.drawingId,
      userId: params.principal.userId,
    },
    select: { id: true },
  });
  return drawing ? "owner" : "none";
};

export const canViewDrawing = (access: DrawingAccess): boolean =>
  access === "owner";

export const canEditDrawing = (access: DrawingAccess): boolean =>
  access === "owner";

export const isOwnerAccess = (access: DrawingAccess): boolean =>
  access === "owner";
