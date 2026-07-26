ALTER TABLE "Collection" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#7c3aed';
ALTER TABLE "Drawing" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH "rankedDrawings" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", COALESCE("collectionId", '')
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS "nextOrder"
  FROM "Drawing"
)
UPDATE "Drawing"
SET "sortOrder" = (
  SELECT "nextOrder"
  FROM "rankedDrawings"
  WHERE "rankedDrawings"."id" = "Drawing"."id"
);

CREATE INDEX "Drawing_userId_collectionId_sortOrder_idx"
ON "Drawing"("userId", "collectionId", "sortOrder");
