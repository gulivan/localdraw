import { randomUUID } from "crypto";
import type { Server as SocketIoServer } from "socket.io";
import type { Prisma, PrismaClient } from "../generated/client";
import { sanitizeDrawingData, sanitizeText } from "../security";
import { buildS3Key, copyS3Object, getPublicUrl, getS3Config, isS3Enabled } from "../s3";
import { getNextSortOrder, normalizeDrawingOrder, placeDrawing } from "../routes/dashboard/drawingOrdering";
import { getUserTrashCollectionId, isTrashCollectionId } from "../routes/dashboard/trash";
import { createSceneElements, deleteSceneElement, updateSceneElement,
  type AgentElementCreate, type AgentElementUpdate } from "./canvasElements";
import { arrangeScene, describeScene, queryScene } from "./canvasScene";
import { McpWorkspaceError } from "./errors";
import { createProject, deleteProject, listProjects, updateProject } from "./workspaceProjects";
import { captureScreenshot, deleteOrphans, deleteStoredCanvasFiles, inspectStorage, trimStorage } from "./workspaceStorage";

type JsonObject = Record<string, any>;
export { McpWorkspaceError } from "./errors";

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export type WorkspaceDeps = {
  prisma: PrismaClient;
  io: SocketIoServer;
  invalidateDrawingsCache: () => void;
};

export class McpWorkspace {
  constructor(
    private readonly userId: string,
    private readonly deps: WorkspaceDeps,
  ) {}

  private get prisma() {
    return this.deps.prisma;
  }

  private async ensureTrash(db: Prisma.TransactionClient | PrismaClient = this.prisma) {
    const id = getUserTrashCollectionId(this.userId);
    await db.collection.upsert({
      where: { id },
      update: {},
      create: { id, name: "Trash", userId: this.userId },
    });
    return id;
  }

  private async ownedDrawing(id: string) {
    const drawing = await this.prisma.drawing.findFirst({ where: { id, userId: this.userId } });
    if (!drawing) throw new McpWorkspaceError("Canvas not found", "NOT_FOUND");
    return drawing;
  }

  private publicCollectionId(collectionId: string | null) {
    return isTrashCollectionId(collectionId, this.userId) ? "trash" : collectionId;
  }

  private drawingResult(drawing: any, includeScene = false) {
    const base = {
      id: drawing.id,
      name: drawing.name,
      projectId: this.publicCollectionId(drawing.collectionId),
      sortOrder: drawing.sortOrder,
      version: drawing.version,
      createdAt: drawing.createdAt,
      updatedAt: drawing.updatedAt,
    };
    if (!includeScene) return base;
    const files = parseJson<JsonObject>(drawing.files, {});
    return {
      ...base,
      elements: parseJson<any[]>(drawing.elements, []),
      appState: parseJson<JsonObject>(drawing.appState, {}),
      files: Object.fromEntries(Object.entries(files).map(([id, file]) => [id, {
        id,
        mimeType: file?.mimeType ?? null,
        created: file?.created ?? null,
        hasData: typeof file?.dataURL === "string" && file.dataURL.length > 0,
      }])),
    };
  }

  async listProjects() {
    return listProjects(this.projectContext());
  }

  async createProject(input: { name: string; color?: string; createInitialCanvas?: boolean }) {
    return createProject(this.projectContext(), input);
  }

  async updateProject(input: { projectId: string; name?: string; color?: string }) {
    return updateProject(this.projectContext(), input);
  }

  async deleteProject(input: { projectId: string; canvasDisposition: "unfiled" | "trash" }) {
    return deleteProject(this.projectContext(), input);
  }

  async listCanvases(input: { projectId?: string | null; search?: string; limit?: number; offset?: number }) {
    const trashId = getUserTrashCollectionId(this.userId);
    const where: Prisma.DrawingWhereInput = { userId: this.userId };
    if (input.projectId === "trash") where.collectionId = { in: [trashId, "trash"] };
    else if (input.projectId === null) where.collectionId = null;
    else if (input.projectId) where.collectionId = input.projectId;
    else where.OR = [{ collectionId: null }, { collectionId: { notIn: [trashId, "trash"] } }];
    if (input.search?.trim()) where.name = { contains: input.search.trim() };
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const [drawings, totalCount] = await Promise.all([
      this.prisma.drawing.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: limit, skip: offset }),
      this.prisma.drawing.count({ where }),
    ]);
    return { canvases: drawings.map((drawing) => this.drawingResult(drawing)), totalCount, limit, offset };
  }

  async getCanvas(canvasId: string) {
    return this.drawingResult(await this.ownedDrawing(canvasId), true);
  }

  async createCanvas(input: { name?: string; projectId?: string | null }) {
    const collectionId = input.projectId === "trash" ? await this.ensureTrash() : input.projectId ?? null;
    if (collectionId && collectionId !== getUserTrashCollectionId(this.userId)) {
      const project = await this.prisma.collection.findFirst({ where: { id: collectionId, userId: this.userId } });
      if (!project) throw new McpWorkspaceError("Project not found", "NOT_FOUND");
    }
    const drawing = await this.prisma.drawing.create({
      data: {
        name: sanitizeText(input.name || "Untitled Drawing", 255) || "Untitled Drawing",
        collectionId,
        userId: this.userId,
        sortOrder: await getNextSortOrder(this.prisma, collectionId, this.userId),
        elements: "[]",
        appState: "{}",
        files: "{}",
      },
    });
    this.deps.invalidateDrawingsCache();
    return this.drawingResult(drawing, true);
  }

  async updateCanvasMetadata(input: { canvasId: string; name: string }) {
    await this.ownedDrawing(input.canvasId);
    const name = sanitizeText(input.name, 255);
    if (!name) throw new McpWorkspaceError("Canvas name is required");
    const drawing = await this.prisma.drawing.update({ where: { id: input.canvasId }, data: { name } });
    this.deps.invalidateDrawingsCache();
    return this.drawingResult(drawing);
  }

  private async cloneS3Files(sourceId: string, targetId: string, files: JsonObject) {
    if (!isS3Enabled()) return files;
    const records = await this.prisma.s3File.findMany({ where: { drawingId: sourceId, userId: this.userId } });
    const cloned = { ...files };
    const cfg = getS3Config();
    for (const record of records) {
      const ext = record.s3Key.includes(".") ? record.s3Key.slice(record.s3Key.lastIndexOf(".") + 1) : "bin";
      const targetKey = buildS3Key(this.userId, targetId, record.fileId, ext);
      await copyS3Object(record.s3Key, targetKey, record.mimeType);
      await this.prisma.s3File.create({ data: { ...record, drawingId: targetId, s3Key: targetKey } });
      if (cloned[record.fileId]) cloned[record.fileId] = {
        ...cloned[record.fileId],
        dataURL: cfg?.publicUrl ? getPublicUrl(targetKey) : `/api/files/${targetId}/${record.fileId}`,
      };
    }
    return cloned;
  }

  async duplicateCanvas(canvasId: string) {
    const source = await this.ownedDrawing(canvasId);
    const id = randomUUID();
    const files = await this.cloneS3Files(source.id, id, parseJson(source.files, {}));
    const drawing = await this.prisma.drawing.create({
      data: {
        id,
        name: `${source.name} (Copy)`,
        elements: source.elements,
        appState: source.appState,
        files: JSON.stringify(files),
        preview: source.preview,
        userId: this.userId,
        collectionId: source.collectionId,
        sortOrder: await getNextSortOrder(this.prisma, source.collectionId, this.userId),
      },
    });
    this.deps.invalidateDrawingsCache();
    return this.drawingResult(drawing, true);
  }

  async moveCanvas(input: { canvasId: string; projectId: string | null; targetIndex: number }) {
    const drawing = await this.ownedDrawing(input.canvasId);
    if (isTrashCollectionId(drawing.collectionId, this.userId)) {
      throw new McpWorkspaceError("Use restore_canvas_from_trash for a trashed canvas");
    }
    if (input.projectId) {
      const project = await this.prisma.collection.findFirst({ where: { id: input.projectId, userId: this.userId } });
      if (!project) throw new McpWorkspaceError("Project not found", "NOT_FOUND");
    }
    const result = await this.prisma.$transaction((tx) => placeDrawing(tx, drawing, input.projectId, input.targetIndex));
    this.deps.invalidateDrawingsCache();
    return { canvasId: drawing.id, projectId: result.collectionId, sortOrder: result.sortOrder };
  }

  async moveCanvasToTrash(canvasId: string) {
    const drawing = await this.ownedDrawing(canvasId);
    const trashId = await this.ensureTrash();
    const index = await this.prisma.drawing.count({ where: { userId: this.userId, collectionId: trashId } });
    await this.prisma.$transaction((tx) => placeDrawing(tx, drawing, trashId, index));
    this.deps.invalidateDrawingsCache();
    return { canvasId, projectId: "trash" };
  }

  async restoreCanvasFromTrash(input: { canvasId: string; projectId: string | null; targetIndex?: number }) {
    const drawing = await this.ownedDrawing(input.canvasId);
    if (!isTrashCollectionId(drawing.collectionId, this.userId)) {
      throw new McpWorkspaceError("Canvas is not in Trash");
    }
    if (input.projectId) {
      const project = await this.prisma.collection.findFirst({ where: { id: input.projectId, userId: this.userId } });
      if (!project) throw new McpWorkspaceError("Project not found", "NOT_FOUND");
    }
    const index = input.targetIndex ?? await this.prisma.drawing.count({ where: { userId: this.userId, collectionId: input.projectId } });
    await this.prisma.$transaction((tx) => placeDrawing(tx, drawing, input.projectId, index));
    this.deps.invalidateDrawingsCache();
    return { canvasId: drawing.id, projectId: input.projectId };
  }

  async permanentlyDeleteCanvas(canvasId: string) {
    const drawing = await this.ownedDrawing(canvasId);
    if (!isTrashCollectionId(drawing.collectionId, this.userId)) {
      throw new McpWorkspaceError("Canvas must be in Trash before permanent deletion", "FORBIDDEN");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.drawing.delete({ where: { id: drawing.id } });
      await normalizeDrawingOrder(tx, drawing.collectionId, this.userId);
    });
    let storedFilesCleaned = true;
    try {
      await deleteStoredCanvasFiles(this.storageContext(), drawing);
    } catch (error) {
      storedFilesCleaned = false;
      console.warn("[mcp/delete] Failed to clean up stored canvas files", { canvasId: drawing.id, error });
    }
    this.deps.invalidateDrawingsCache();
    return { permanentlyDeletedCanvasId: drawing.id, storedFilesCleaned };
  }

  async listCanvasHistory(input: { canvasId: string; limit?: number; offset?: number }) {
    await this.ownedDrawing(input.canvasId);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const [snapshots, totalCount] = await Promise.all([
      this.prisma.drawingSnapshot.findMany({ where: { drawingId: input.canvasId }, select: { id: true, version: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      this.prisma.drawingSnapshot.count({ where: { drawingId: input.canvasId } }),
    ]);
    return { snapshots, totalCount, limit, offset };
  }

  async getCanvasSnapshot(input: { canvasId: string; snapshotId: string }) {
    await this.ownedDrawing(input.canvasId);
    const snapshot = await this.prisma.drawingSnapshot.findFirst({ where: { id: input.snapshotId, drawingId: input.canvasId } });
    if (!snapshot) throw new McpWorkspaceError("Snapshot not found", "NOT_FOUND");
    return { ...snapshot, elements: parseJson(snapshot.elements, []), appState: parseJson(snapshot.appState, {}), files: Object.keys(parseJson(snapshot.files, {})) };
  }

  async restoreCanvasSnapshot(input: { canvasId: string; snapshotId: string }) {
    const drawing = await this.ownedDrawing(input.canvasId);
    const snapshot = await this.prisma.drawingSnapshot.findFirst({ where: { id: input.snapshotId, drawingId: input.canvasId } });
    if (!snapshot) throw new McpWorkspaceError("Snapshot not found", "NOT_FOUND");
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.drawingSnapshot.create({ data: { drawingId: drawing.id, version: drawing.version, elements: drawing.elements, appState: drawing.appState, files: drawing.files } });
      return tx.drawing.update({ where: { id: drawing.id }, data: { elements: snapshot.elements, appState: snapshot.appState, files: snapshot.files, version: { increment: 1 } } });
    });
    this.afterSceneChange(drawing.id);
    return this.drawingResult(updated, true);
  }

  private afterSceneChange(canvasId: string) {
    this.deps.invalidateDrawingsCache();
    this.deps.io.to(`drawing_${canvasId}`).emit("drawing-server-update", { drawingId: canvasId });
  }

  private async mutateCanvas(
    canvasId: string,
    expectedVersion: number,
    mutate: (elements: any[]) => { changedIds: string[]; createdIds?: string[] },
  ) {
    const drawing = await this.ownedDrawing(canvasId);
    if (drawing.version !== expectedVersion) {
      throw new McpWorkspaceError("Canvas version conflict", "CONFLICT", { currentVersion: drawing.version });
    }
    const elements = structuredClone(parseJson<any[]>(drawing.elements, []));
    const mutation = mutate(elements);
    const sanitized = sanitizeDrawingData({
      elements,
      appState: parseJson(drawing.appState, {}),
      files: parseJson(drawing.files, {}),
      preview: drawing.preview,
    });
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.drawingSnapshot.create({ data: { drawingId: drawing.id, version: drawing.version, elements: drawing.elements, appState: drawing.appState, files: drawing.files } });
      const update = await tx.drawing.updateMany({
        where: { id: drawing.id, userId: this.userId, version: expectedVersion },
        data: { elements: JSON.stringify(sanitized.elements), version: { increment: 1 } },
      });
      if (update.count !== 1) throw new McpWorkspaceError("Canvas version conflict", "CONFLICT");
      return tx.drawing.findUniqueOrThrow({ where: { id: drawing.id } });
    });
    this.afterSceneChange(canvasId);
    return { canvasId, previousVersion: expectedVersion, version: result.version, ...mutation };
  }

  async describeCanvas(canvasId: string) {
    const drawing = await this.ownedDrawing(canvasId);
    return { canvasId, version: drawing.version, description: describeScene(parseJson(drawing.elements, [])) };
  }

  async queryCanvasElements(input: { canvasId: string; type?: string; text?: string; locked?: boolean; bbox?: { xMin: number; yMin: number; xMax: number; yMax: number } }) {
    const drawing = await this.ownedDrawing(input.canvasId);
    return { canvasId: drawing.id, version: drawing.version, elements: queryScene(parseJson(drawing.elements, []), input) };
  }

  async applyCanvasPatch(input: { canvasId: string; expectedVersion: number; create?: AgentElementCreate[]; update?: AgentElementUpdate[]; delete?: string[] }) {
    const operationCount = (input.create?.length ?? 0) + (input.update?.length ?? 0) + (input.delete?.length ?? 0);
    if (operationCount === 0) throw new McpWorkspaceError("Patch has no operations");
    if (operationCount > 500) throw new McpWorkspaceError("Patch exceeds 500 operations");
    return this.mutateCanvas(input.canvasId, input.expectedVersion, (elements) => {
      const changed = new Set<string>();
      const createdIds: string[] = [];
      for (const create of input.create ?? []) {
        const result = createSceneElements(create, elements);
        elements.push(...result.elements);
        createdIds.push(result.primaryId);
        result.elements.forEach((element) => changed.add(element.id));
      }
      for (const update of input.update ?? []) updateSceneElement(update, elements).forEach((id) => changed.add(id));
      for (const id of input.delete ?? []) deleteSceneElement(id, elements).forEach((changedId) => changed.add(changedId));
      return { changedIds: [...changed], createdIds };
    });
  }

  async arrangeCanvasElements(input: {
    canvasId: string;
    expectedVersion: number;
    action: "align" | "distribute" | "group" | "ungroup" | "lock" | "unlock" | "duplicate";
    elementIds: string[];
    alignment?: "left" | "center" | "right" | "top" | "middle" | "bottom";
    direction?: "horizontal" | "vertical";
    groupId?: string;
    offsetX?: number;
    offsetY?: number;
  }) {
    return this.mutateCanvas(input.canvasId, input.expectedVersion, (elements) => ({
      changedIds: arrangeScene(elements, input),
    }));
  }

  async inspectCanvasStorage(canvasId: string) {
    return inspectStorage(this.storageContext(), await this.ownedDrawing(canvasId));
  }

  async trimCanvasStorage(input: { canvasId: string; confirmCanvasName: string }) {
    return trimStorage(this.storageContext(), await this.ownedDrawing(input.canvasId), input.confirmCanvasName);
  }

  async deleteCanvasOrphanFiles(input: { canvasId: string; confirmCanvasName: string; fileIds: string[] }) {
    return deleteOrphans(this.storageContext(), await this.ownedDrawing(input.canvasId), input.confirmCanvasName, input.fileIds);
  }

  async captureCanvasScreenshot(input: { canvasId: string; background?: boolean }) {
    return captureScreenshot(this.storageContext(), await this.ownedDrawing(input.canvasId), input.background);
  }

  private storageContext() {
    return { prisma: this.prisma, io: this.deps.io, userId: this.userId,
      afterChange: (id: string) => this.afterSceneChange(id),
      fail: (message: string, code: "INVALID" | "UNAVAILABLE" = "INVALID", details?: Record<string, unknown>) =>
        new McpWorkspaceError(message, code, details) };
  }

  private projectContext() {
    return { prisma: this.prisma, userId: this.userId,
      ensureTrash: (db?: Prisma.TransactionClient | PrismaClient) => this.ensureTrash(db),
      invalidateDrawingsCache: this.deps.invalidateDrawingsCache,
      fail: (message: string, code?: "NOT_FOUND") =>
        new McpWorkspaceError(message, code ?? "INVALID") };
  }
}
