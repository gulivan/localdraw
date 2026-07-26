import { Database } from "bun:sqlite";

const hasColumn = (db: Database, table: string, column: string) =>
  db
    .query(`PRAGMA table_info("${table}")`)
    .all()
    .some((row) => (row as { name?: string }).name === column);

export const ensureWorkspaceSchema = (databasePath: string) => {
  const db = new Database(databasePath, { create: true });
  try {
    db.transaction(() => {
      if (!hasColumn(db, "Collection", "color")) {
        db.exec(
          `ALTER TABLE "Collection" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#7c3aed'`,
        );
      }
      if (!hasColumn(db, "Drawing", "sortOrder")) {
        db.exec(
          `ALTER TABLE "Drawing" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0`,
        );
        db.exec(`
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
          )
        `);
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS "Drawing_userId_collectionId_sortOrder_idx"
        ON "Drawing"("userId", "collectionId", "sortOrder")
      `);
    })();
  } finally {
    db.close();
  }
};
