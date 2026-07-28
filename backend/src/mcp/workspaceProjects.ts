import type { Prisma, PrismaClient } from "../generated/client";
import { sanitizeText } from "../security";
import { getNextSortOrder } from "../routes/dashboard/drawingOrdering";
import { getUserTrashCollectionId } from "../routes/dashboard/trash";

type ProjectError = (message: string, code?: "NOT_FOUND") => Error;

type Context = {
  prisma: PrismaClient;
  userId: string;
  ensureTrash: (db?: Prisma.TransactionClient | PrismaClient) => Promise<string>;
  invalidateDrawingsCache: () => void;
  fail: ProjectError;
};

const projectColorPattern = /^#[0-9a-fA-F]{6}$/;

export const listProjects = async (ctx: Context) => {
  await ctx.ensureTrash();
  const trashId = getUserTrashCollectionId(ctx.userId);
  const projects = await ctx.prisma.collection.findMany({
    where: { userId: ctx.userId },
    include: { _count: { select: { drawings: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return projects.map((project) => ({
    id: project.id === trashId ? "trash" : project.id,
    name: project.id === trashId ? "Trash" : project.name,
    color: project.color,
    canvasCount: project._count.drawings,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
};

export const createProject = async (ctx: Context, input: {
  name: string;
  color?: string;
  createInitialCanvas?: boolean;
}) => {
  const name = sanitizeText(input.name, 100);
  if (!name) throw ctx.fail("Project name is required");
  const color = input.color && projectColorPattern.test(input.color) ? input.color.toLowerCase() : "#7c3aed";
  const result = await ctx.prisma.$transaction(async (tx) => {
    const project = await tx.collection.create({ data: { name, color, userId: ctx.userId } });
    const canvas = input.createInitialCanvas
      ? await tx.drawing.create({
          data: {
            name: "Slide 1", elements: "[]", appState: "{}", files: "{}",
            userId: ctx.userId, collectionId: project.id, sortOrder: 0,
          },
        })
      : null;
    return { project, canvas };
  });
  ctx.invalidateDrawingsCache();
  return { ...result.project, initialCanvasId: result.canvas?.id ?? null };
};

export const updateProject = async (ctx: Context, input: {
  projectId: string;
  name?: string;
  color?: string;
}) => {
  if (input.projectId === "trash") throw ctx.fail("Trash cannot be changed");
  const project = await ctx.prisma.collection.findFirst({ where: { id: input.projectId, userId: ctx.userId } });
  if (!project) throw ctx.fail("Project not found", "NOT_FOUND");
  const data: { name?: string; color?: string } = {};
  if (input.name !== undefined) {
    data.name = sanitizeText(input.name, 100);
    if (!data.name) throw ctx.fail("Project name is required");
  }
  if (input.color !== undefined) {
    if (!projectColorPattern.test(input.color)) throw ctx.fail("Invalid project color");
    data.color = input.color.toLowerCase();
  }
  if (Object.keys(data).length === 0) throw ctx.fail("No project changes supplied");
  return ctx.prisma.collection.update({ where: { id: project.id }, data });
};

export const deleteProject = async (ctx: Context, input: {
  projectId: string;
  canvasDisposition: "unfiled" | "trash";
}) => {
  if (input.projectId === "trash") throw ctx.fail("Trash cannot be deleted");
  const project = await ctx.prisma.collection.findFirst({ where: { id: input.projectId, userId: ctx.userId } });
  if (!project) throw ctx.fail("Project not found", "NOT_FOUND");
  const target = input.canvasDisposition === "trash" ? await ctx.ensureTrash() : null;
  await ctx.prisma.$transaction(async (tx) => {
    const drawings = await tx.drawing.findMany({
      where: { collectionId: project.id, userId: ctx.userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const start = await getNextSortOrder(tx, target, ctx.userId);
    await Promise.all(drawings.map((drawing, index) => tx.drawing.update({
      where: { id: drawing.id }, data: { collectionId: target, sortOrder: start + index },
    })));
    await tx.collection.delete({ where: { id: project.id } });
  });
  ctx.invalidateDrawingsCache();
  return { deletedProjectId: project.id, canvasDisposition: input.canvasDisposition };
};
