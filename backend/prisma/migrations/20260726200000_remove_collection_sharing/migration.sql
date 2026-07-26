-- Projects are single-owner containers. Preserve collection-share access as
-- drawing-level ACLs before removing the collection-level feature.
INSERT OR IGNORE INTO "DrawingPermission" (
  "id",
  "drawingId",
  "granteeUserId",
  "permission",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  'collection-share-' || "Drawing"."id" || '-' || "CollectionShare"."granteeUserId",
  "Drawing"."id",
  "CollectionShare"."granteeUserId",
  "CollectionShare"."role",
  "CollectionShare"."createdByUserId",
  "CollectionShare"."createdAt",
  "CollectionShare"."updatedAt"
FROM "CollectionShare"
JOIN "Drawing" ON "Drawing"."collectionId" = "CollectionShare"."collectionId"
WHERE "Drawing"."userId" <> "CollectionShare"."granteeUserId";

UPDATE "DrawingPermission"
SET "permission" = 'edit', "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "Drawing"
  JOIN "CollectionShare"
    ON "CollectionShare"."collectionId" = "Drawing"."collectionId"
  WHERE "Drawing"."id" = "DrawingPermission"."drawingId"
    AND "CollectionShare"."granteeUserId" = "DrawingPermission"."granteeUserId"
    AND "CollectionShare"."role" = 'edit'
    AND "Drawing"."userId" <> "CollectionShare"."granteeUserId"
);

-- Collection owners previously inherited access to drawings created by a
-- collaborator. Keep edit access, then return those drawings to their actual
-- owner's Unfiled area so project ordering never crosses user boundaries.
INSERT OR IGNORE INTO "DrawingPermission" (
  "id",
  "drawingId",
  "granteeUserId",
  "permission",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  'collection-owner-' || "Drawing"."id" || '-' || "Collection"."userId",
  "Drawing"."id",
  "Collection"."userId",
  'edit',
  "Drawing"."userId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Drawing"
JOIN "Collection" ON "Collection"."id" = "Drawing"."collectionId"
WHERE "Drawing"."userId" <> "Collection"."userId";

UPDATE "DrawingPermission"
SET "permission" = 'edit', "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "Drawing"
  JOIN "Collection" ON "Collection"."id" = "Drawing"."collectionId"
  WHERE "Drawing"."id" = "DrawingPermission"."drawingId"
    AND "Collection"."userId" = "DrawingPermission"."granteeUserId"
    AND "Drawing"."userId" <> "Collection"."userId"
);

UPDATE "Drawing"
SET "collectionId" = NULL
WHERE EXISTS (
  SELECT 1
  FROM "Collection"
  WHERE "Collection"."id" = "Drawing"."collectionId"
    AND "Collection"."userId" <> "Drawing"."userId"
);

WITH "rankedDrawings" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", COALESCE("collectionId", '')
      ORDER BY "sortOrder" ASC, "createdAt" ASC, "id" ASC
    ) - 1 AS "nextOrder"
  FROM "Drawing"
)
UPDATE "Drawing"
SET "sortOrder" = (
  SELECT "nextOrder"
  FROM "rankedDrawings"
  WHERE "rankedDrawings"."id" = "Drawing"."id"
);

DROP TABLE "CollectionShare";
