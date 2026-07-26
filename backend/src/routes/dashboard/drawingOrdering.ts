import type { Prisma, PrismaClient } from "../../generated/client";

type Database = Prisma.TransactionClient | PrismaClient;

const scopeWhere = (
  collectionId: string | null,
  ownerUserId: string,
): Prisma.DrawingWhereInput =>
  ({ collectionId, userId: ownerUserId });

export const getNextSortOrder = async (
  db: Database,
  collectionId: string | null,
  ownerUserId: string,
) => {
  const result = await db.drawing.aggregate({
    where: scopeWhere(collectionId, ownerUserId),
    _max: { sortOrder: true },
  });
  return (result._max.sortOrder ?? -1) + 1;
};

export const normalizeDrawingOrder = async (
  db: Database,
  collectionId: string | null,
  ownerUserId: string,
) => {
  const drawings = await db.drawing.findMany({
    where: scopeWhere(collectionId, ownerUserId),
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  await Promise.all(
    drawings.map((drawing, sortOrder) =>
      db.drawing.update({
        where: { id: drawing.id },
        data: { sortOrder },
      }),
    ),
  );
  return drawings.map((drawing, sortOrder) => ({ ...drawing, sortOrder }));
};

export const moveCollectionSlides = async (
  db: Database,
  collectionId: string,
  ownerUserId: string,
  targetCollectionId: string | null,
) => {
  const slides = await db.drawing.findMany({
    where: { collectionId, userId: ownerUserId },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const start = await getNextSortOrder(db, targetCollectionId, ownerUserId);
  await Promise.all(
    slides.map((slide, index) =>
      db.drawing.update({
        where: { id: slide.id },
        data: { collectionId: targetCollectionId, sortOrder: start + index },
      }),
    ),
  );
};

export const moveCollectionSlidesToUnfiled = (
  db: Database,
  collectionId: string,
  ownerUserId: string,
) => moveCollectionSlides(db, collectionId, ownerUserId, null);

export const placeDrawing = async (
  db: Database,
  drawing: { id: string; userId: string; collectionId: string | null },
  targetCollectionId: string | null,
  targetIndex: number,
) => {
  const sourceCollectionId = drawing.collectionId;
  const sourceScope = scopeWhere(sourceCollectionId, drawing.userId);
  const targetScope = scopeWhere(targetCollectionId, drawing.userId);
  const sameScope = sourceCollectionId === targetCollectionId;
  const source = await db.drawing.findMany({
    where: sourceScope,
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const sourceWithoutMoved = source.filter((item) => item.id !== drawing.id);
  const targetBase = sameScope
    ? sourceWithoutMoved
    : (await db.drawing.findMany({
        where: targetScope,
        select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      })).filter((item) => item.id !== drawing.id);
  const insertAt = Math.max(0, Math.min(targetIndex, targetBase.length));
  const target = [...targetBase];
  target.splice(insertAt, 0, { id: drawing.id });

  await db.drawing.update({
    where: { id: drawing.id },
    data: { collectionId: targetCollectionId, sortOrder: insertAt },
  });
  if (!sameScope) {
    await Promise.all(
      sourceWithoutMoved.map((item, sortOrder) =>
        db.drawing.update({ where: { id: item.id }, data: { sortOrder } }),
      ),
    );
  }
  await Promise.all(
    target.map((item, sortOrder) =>
      db.drawing.update({ where: { id: item.id }, data: { sortOrder } }),
    ),
  );

  const orders = sameScope
    ? [{ collectionId: targetCollectionId, items: target.map((item, sortOrder) => ({ ...item, sortOrder })) }]
    : [
        { collectionId: sourceCollectionId, items: sourceWithoutMoved.map((item, sortOrder) => ({ ...item, sortOrder })) },
        { collectionId: targetCollectionId, items: target.map((item, sortOrder) => ({ ...item, sortOrder })) },
      ];
  return { collectionId: targetCollectionId, sortOrder: insertAt, orders };
};
