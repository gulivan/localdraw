import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  moveCollectionSlides,
  moveCollectionSlidesToUnfiled,
  placeDrawing,
} from "../routes/dashboard/drawingOrdering";
import {
  cleanupTestDb,
  getTestPrisma,
  initTestDb,
  setupTestDb,
} from "./testUtils";

describe("project canvas ordering", () => {
  const prisma = getTestPrisma();
  let userId: string;

  beforeAll(async () => {
    setupTestDb();
    userId = (await initTestDb(prisma)).id;
  });

  beforeEach(async () => {
    await cleanupTestDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createProject = (name: string) =>
    prisma.collection.create({ data: { name, userId } });

  const createSlide = (
    name: string,
    collectionId: string | null,
    sortOrder: number,
  ) =>
    prisma.drawing.create({
      data: {
        name,
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId,
        collectionId,
        sortOrder,
      },
    });

  it("reorders a canvas within its project and normalizes every position", async () => {
    const project = await createProject("Storyboard");
    const first = await createSlide("One", project.id, 0);
    const second = await createSlide("Two", project.id, 1);
    const third = await createSlide("Three", project.id, 2);

    await prisma.$transaction((tx) =>
      placeDrawing(tx, third, project.id, 0),
    );

    const ordered = await prisma.drawing.findMany({
      where: { collectionId: project.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });
    expect(ordered).toEqual([
      { id: third.id, sortOrder: 0 },
      { id: first.id, sortOrder: 1 },
      { id: second.id, sortOrder: 2 },
    ]);
  });

  it("moves a canvas across projects and closes the source order gap", async () => {
    const source = await createProject("Source");
    const target = await createProject("Target");
    const first = await createSlide("One", source.id, 0);
    const moved = await createSlide("Move me", source.id, 1);
    const last = await createSlide("Three", source.id, 2);
    const targetSlide = await createSlide("Target one", target.id, 0);

    await prisma.$transaction((tx) =>
      placeDrawing(tx, moved, target.id, 1),
    );

    const [sourceOrder, targetOrder] = await Promise.all([
      prisma.drawing.findMany({
        where: { collectionId: source.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true },
      }),
      prisma.drawing.findMany({
        where: { collectionId: target.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true },
      }),
    ]);
    expect(sourceOrder).toEqual([
      { id: first.id, sortOrder: 0 },
      { id: last.id, sortOrder: 1 },
    ]);
    expect(targetOrder).toEqual([
      { id: targetSlide.id, sortOrder: 0 },
      { id: moved.id, sortOrder: 1 },
    ]);
  });

  it("appends a deleted project's ordered canvases to Unfiled", async () => {
    const project = await createProject("Temporary");
    const unfiled = await createSlide("Existing loose canvas", null, 0);
    const first = await createSlide("Project one", project.id, 0);
    const second = await createSlide("Project two", project.id, 1);

    await prisma.$transaction((tx) =>
      moveCollectionSlidesToUnfiled(tx, project.id, userId),
    );

    const ordered = await prisma.drawing.findMany({
      where: { userId, collectionId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });
    expect(ordered).toEqual([
      { id: unfiled.id, sortOrder: 0 },
      { id: first.id, sortOrder: 1 },
      { id: second.id, sortOrder: 2 },
    ]);
  });

  it("appends a deleted project's canvases to Trash when requested", async () => {
    const project = await createProject("Temporary");
    const trash = await createProject("Trash");
    const existing = await createSlide("Already deleted", trash.id, 0);
    const first = await createSlide("Project one", project.id, 0);
    const second = await createSlide("Project two", project.id, 1);

    await prisma.$transaction((tx) =>
      moveCollectionSlides(tx, project.id, userId, trash.id),
    );

    const ordered = await prisma.drawing.findMany({
      where: { userId, collectionId: trash.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });
    expect(ordered).toEqual([
      { id: existing.id, sortOrder: 0 },
      { id: first.id, sortOrder: 1 },
      { id: second.id, sortOrder: 2 },
    ]);
  });
});
