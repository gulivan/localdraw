import express from "express";
import { DashboardRouteDeps } from "./types";
import { getUserTrashCollectionId, isTrashCollectionId } from "./trash";
import { moveCollectionSlides, moveCollectionSlidesToUnfiled } from "./drawingOrdering";

const projectColorPattern = /^#[0-9a-fA-F]{6}$/;

export const registerCollectionRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    collectionNameSchema,
    sanitizeText,
    ensureTrashCollection,
    invalidateDrawingsCache,
    config,
    logAuditEvent,
  } = deps;

  // GET /collections — returns collections owned by the current user
  app.get(
    "/collections",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const trashCollectionId = getUserTrashCollectionId(req.user.id);
      const includeOverview = req.query.includeOverview === "true";
      await ensureTrashCollection(prisma, req.user.id);

      const rawCollections = await prisma.collection.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        ...(includeOverview
          ? {
              include: {
                drawings: {
                  select: {
                    id: true,
                    name: true,
                    preview: true,
                    sortOrder: true,
                    updatedAt: true,
                  },
                  orderBy: { updatedAt: "desc" as const },
                  take: 1,
                },
                _count: { select: { drawings: true } },
              },
            }
          : {}),
      });
      const hasInternalTrash = rawCollections.some(
        (c) => c.id === trashCollectionId,
      );
      type OverviewCollection = (typeof rawCollections)[number] & {
        drawings: Array<{
          id: string;
          name: string;
          preview: string | null;
          sortOrder: number;
          updatedAt: Date;
        }>;
        _count: { drawings: number };
      };
      const toOverview = (collection: (typeof rawCollections)[number]) => {
        if (!includeOverview) return collection;
        const { drawings, _count, ...rest } = collection as OverviewCollection;
        return {
          ...rest,
          drawingCount: _count?.drawings ?? 0,
          latestDrawing: drawings?.[0] ?? null,
          lastActivityAt: drawings?.[0]?.updatedAt ?? collection.updatedAt,
        };
      };
      const ownedCollections = rawCollections
        .filter((c) => !(hasInternalTrash && c.id === "trash"))
        .map((raw) => {
          const c = toOverview(raw);
          return c.id === trashCollectionId
            ? {
                ...c,
                id: "trash",
                name: "Trash",
              }
            : c;
        });
      return res.json(ownedCollections);
    }),
  );

  // POST /collections
  app.post(
    "/collections",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const parsed = collectionNameSchema.safeParse(req.body.name);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Collection name must be between 1 and 100 characters",
        });
      }

      const sanitizedName = sanitizeText(parsed.data, 100);
      const color = typeof req.body.color === "string" && projectColorPattern.test(req.body.color)
        ? req.body.color.toLowerCase()
        : "#7c3aed";
      const result = await prisma.$transaction(async (tx) => {
        const collection = await tx.collection.create({
          data: { name: sanitizedName, color, userId: req.user!.id },
        });
        if (req.body.createInitialDrawing !== true) {
          return { collection, initialDrawingId: undefined };
        }
        const drawing = await tx.drawing.create({
          data: {
            name: "Canvas 1",
            elements: "[]",
            appState: "{}",
            files: "{}",
            userId: req.user!.id,
            collectionId: collection.id,
            sortOrder: 0,
          },
        });
        return { collection, initialDrawingId: drawing.id };
      });
      invalidateDrawingsCache();
      return res.json({
        ...result.collection,
        initialDrawingId: result.initialDrawingId,
      });
    }),
  );

  // PUT /collections/:id — owner only
  app.put(
    "/collections/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      if (isTrashCollectionId(id, req.user.id)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Trash collection cannot be renamed",
        });
      }
      const existing = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!existing)
        return res.status(404).json({ error: "Collection not found" });

      const hasName = req.body.name !== undefined;
      const hasColor = req.body.color !== undefined;
      const parsed = hasName ? collectionNameSchema.safeParse(req.body.name) : null;
      if ((!hasName && !hasColor) || (parsed && !parsed.success)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Collection name must be between 1 and 100 characters",
        });
      }

      if (hasColor && (typeof req.body.color !== "string" || !projectColorPattern.test(req.body.color))) {
        return res.status(400).json({ error: "Validation error", message: "Invalid project color" });
      }
      const data: { name?: string; color?: string } = {};
      if (parsed?.success) data.name = sanitizeText(parsed.data, 100);
      if (hasColor) data.color = req.body.color.toLowerCase();
      await prisma.collection.updateMany({
        where: { id, userId: req.user.id },
        data,
      });
      const updated = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!updated)
        return res.status(404).json({ error: "Collection not found" });
      return res.json(updated);
    }),
  );

  // DELETE /collections/:id — owner only
  app.delete(
    "/collections/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      if (isTrashCollectionId(id, req.user.id)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Trash collection cannot be deleted",
        });
      }
      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      const deleteSlides = req.query.deleteSlides === "true";
      const trashCollectionId = getUserTrashCollectionId(req.user.id);
      if (deleteSlides) await ensureTrashCollection(prisma, req.user.id);
      await prisma.$transaction(async (tx) => {
        if (deleteSlides) {
          await moveCollectionSlides(tx, id, req.user!.id, trashCollectionId);
        } else {
          await moveCollectionSlidesToUnfiled(tx, id, req.user!.id);
        }
        await tx.collection.deleteMany({ where: { id, userId: req.user!.id } });
      });
      invalidateDrawingsCache();

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: req.user.id,
          action: "collection_deleted",
          resource: `collection:${id}`,
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { collectionId: id, collectionName: collection.name, deleteSlides },
        });
      }

      return res.json({ success: true });
    }),
  );
};
