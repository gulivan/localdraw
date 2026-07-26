import express from "express";
import { Prisma } from "../../generated/client";
import { getUserTrashCollectionId, toPublicTrashCollectionId } from "./trash";
import { SortDirection, SortField } from "./types";
import type { DrawingRouteContext } from "./drawingRouteContext";
import {
  matchesDrawingSearch,
  paginateSearchResults,
} from "./drawingTextSearch";

export const registerDrawingListRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    parseJsonField,
    buildDrawingsCacheKey,
    getCachedDrawingsBody,
    cacheDrawingsResponse,
    MAX_PAGE_SIZE,
  } = context;
  app.get(
    "/drawings",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const trashCollectionId = getUserTrashCollectionId(req.user.id);
      const {
        search,
        collectionId,
        includeData,
        includePreview,
        limit,
        offset,
        sortField,
        sortDirection,
      } = req.query;
      const where: Prisma.DrawingWhereInput = { userId: req.user.id };
      const searchTerm =
        typeof search === "string" && search.trim().length > 0
          ? search.trim()
          : undefined;
      if (searchTerm) {
        where.AND = [{
          OR: [
            { name: { contains: searchTerm } },
            { elements: { contains: searchTerm } },
          ],
        }];
      }

      let collectionFilterKey = "default";
      if (collectionId === "null") {
        where.collectionId = null;
        collectionFilterKey = "null";
      } else if (collectionId) {
        const normalizedCollectionId = String(collectionId);
        if (normalizedCollectionId === "trash") {
          where.collectionId = { in: [trashCollectionId, "trash"] };
          collectionFilterKey = "trash";
        } else {
          const collection = await prisma.collection.findFirst({
            where: { id: normalizedCollectionId, userId: req.user.id },
          });
          if (!collection) {
            return res.status(404).json({ error: "Collection not found" });
          }

          where.collectionId = normalizedCollectionId;
          collectionFilterKey = `id:${normalizedCollectionId}`;
        }
      } else {
        where.OR = [
          { collectionId: { notIn: [trashCollectionId, "trash"] } },
          { collectionId: null },
        ];
      }

      const shouldIncludeData =
        typeof includeData === "string"
          ? includeData.toLowerCase() === "true" || includeData === "1"
          : false;
      const shouldIncludePreview =
        typeof includePreview === "string"
          ? includePreview.toLowerCase() === "true" || includePreview === "1"
          : false;
      const parsedSortField: SortField =
        sortField === "name" ||
        sortField === "createdAt" ||
        sortField === "updatedAt" ||
        sortField === "sortOrder"
          ? sortField
          : "updatedAt";
      const parsedSortDirection: SortDirection =
        sortDirection === "asc" || sortDirection === "desc"
          ? sortDirection
          : parsedSortField === "name"
            ? "asc"
            : "desc";

      const rawLimit = limit ? Number.parseInt(limit as string, 10) : undefined;
      const rawOffset = offset
        ? Number.parseInt(offset as string, 10)
        : undefined;
      const parsedLimit =
        rawLimit !== undefined && Number.isFinite(rawLimit)
          ? Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE)
          : undefined;
      const parsedOffset =
        rawOffset !== undefined && Number.isFinite(rawOffset)
          ? Math.max(rawOffset, 0)
          : undefined;

      const cacheKey =
        buildDrawingsCacheKey({
          userId: req.user.id,
          searchTerm: searchTerm ?? "",
          collectionFilter: collectionFilterKey,
          includeData: shouldIncludeData,
          sortField: parsedSortField,
          sortDirection: parsedSortDirection,
        }) + `:${parsedLimit}:${parsedOffset}:preview=${shouldIncludePreview ? "1" : "0"}`;

      const cachedBody = getCachedDrawingsBody(cacheKey);
      if (cachedBody) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("Content-Type", "application/json");
        return res.send(cachedBody);
      }

      const summarySelect: Prisma.DrawingSelect = {
        id: true,
        name: true,
        collectionId: true,
        sortOrder: true,
        ...(shouldIncludePreview ? { preview: true } : {}),
        version: true,
        createdAt: true,
        updatedAt: true,
        ...(searchTerm ? { elements: true } : {}),
        user: { select: { id: true, name: true } },
      };

      const orderBy: Prisma.DrawingOrderByWithRelationInput | Prisma.DrawingOrderByWithRelationInput[] =
        parsedSortField === "name"
          ? { name: parsedSortDirection }
          : parsedSortField === "createdAt"
            ? { createdAt: parsedSortDirection }
            : parsedSortField === "sortOrder"
              ? [{ sortOrder: parsedSortDirection }, { id: "asc" }]
              : { updatedAt: parsedSortDirection };

      const queryOptions: Prisma.DrawingFindManyArgs = { where, orderBy };
      if (!searchTerm && parsedLimit !== undefined) queryOptions.take = parsedLimit;
      if (!searchTerm && parsedOffset !== undefined) queryOptions.skip = parsedOffset;
      if (!shouldIncludeData) queryOptions.select = summarySelect;

      const [queriedDrawings, storedCount] = await Promise.all([
        prisma.drawing.findMany(queryOptions),
        searchTerm ? Promise.resolve(null) : prisma.drawing.count({ where }),
      ]);
      const matchingDrawings = searchTerm
        ? (queriedDrawings as any[]).filter((drawing) =>
            matchesDrawingSearch(drawing, searchTerm),
          )
        : (queriedDrawings as any[]);
      const totalCount = searchTerm ? matchingDrawings.length : storedCount;
      const drawings = searchTerm
        ? paginateSearchResults(matchingDrawings, parsedOffset, parsedLimit)
        : matchingDrawings;

      let responsePayload: any[] = drawings as any[];
      if (shouldIncludeData) {
        responsePayload = (drawings as any[]).map((d: any) => ({
          ...d,
          collectionId: toPublicTrashCollectionId(d.collectionId, req.user!.id),
          elements: parseJsonField(d.elements, []),
          appState: parseJsonField(d.appState, {}),
          files: parseJsonField(d.files, {}),
          creatorName: d.user?.name ?? null,
          user: undefined,
        }));
      } else {
        responsePayload = (drawings as any[]).map((d: any) => {
          const { elements: _elements, ...summary } = d;
          return {
            ...summary,
            collectionId: toPublicTrashCollectionId(d.collectionId, req.user!.id),
            creatorName: d.user?.name ?? null,
            user: undefined,
          };
        });
      }

      const finalResponse = {
        drawings: responsePayload,
        totalCount,
        limit: parsedLimit,
        offset: parsedOffset,
      };

      const body = cacheDrawingsResponse(cacheKey, finalResponse);
      res.setHeader("X-Cache", "MISS");
      res.setHeader("Content-Type", "application/json");
      return res.send(body);
    }),
  );

};
