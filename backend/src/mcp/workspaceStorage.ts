import { randomUUID } from "crypto";
import type { PrismaClient } from "../generated/client";
import type { Server as SocketIoServer } from "socket.io";
import { deleteS3Object, drawingS3Prefix, isS3Enabled, listS3Objects } from "../s3";
import { buildFilesDiffResponse, buildOrphanDeletePlan, buildTrimPlan, buildTrimS3CleanupPlan } from "../routes/storage/plans";
import { deleteS3KeysInBatches } from "../routes/storage/s3Delete";

type DrawingRecord = Awaited<ReturnType<PrismaClient["drawing"]["findFirstOrThrow"]>>;
type Fail = (message: string, code?: "INVALID" | "UNAVAILABLE", details?: Record<string, unknown>) => Error;
type Context = {
  prisma: PrismaClient;
  io: SocketIoServer;
  userId: string;
  afterChange: (drawingId: string) => void;
  fail: Fail;
};

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};

export const deleteStoredCanvasFiles = async (ctx: Context, drawing: DrawingRecord) => {
  if (!isS3Enabled()) return;
  const [objects, records] = await Promise.all([
    listS3Objects(drawingS3Prefix(ctx.userId, drawing.id)),
    ctx.prisma.s3File.findMany({ where: { drawingId: drawing.id, userId: ctx.userId } }),
  ]);
  await deleteS3KeysInBatches({
    keys: Array.from(new Set([...objects.map((item) => item.key), ...records.map((item) => item.s3Key)])),
    logPrefix: "[mcp/delete]",
    deleteObject: deleteS3Object,
  });
  await ctx.prisma.s3File.deleteMany({ where: { drawingId: drawing.id, userId: ctx.userId } });
};

export const inspectStorage = async (ctx: Context, drawing: DrawingRecord) => {
  const elements = parseJson<any[]>(drawing.elements, []);
  const files = parseJson<Record<string, any>>(drawing.files, {});
  const [records, objects] = isS3Enabled() ? await Promise.all([
    ctx.prisma.s3File.findMany({ where: { drawingId: drawing.id }, select: { fileId: true, s3Key: true, mimeType: true } }),
    listS3Objects(drawingS3Prefix(ctx.userId, drawing.id)),
  ]) : [[], []];
  return buildFilesDiffResponse({ elements, files, s3FileRecords: records, s3Objects: objects });
};

export const trimStorage = async (ctx: Context, drawing: DrawingRecord, confirmName: string) => {
  if (confirmName !== drawing.name) throw ctx.fail("confirmCanvasName does not match");
  const plan = buildTrimPlan(parseJson(drawing.elements, []), parseJson(drawing.files, {}));
  let s3ObjectsDeleted = 0;
  let s3DeleteErrors = 0;
  if (isS3Enabled()) {
    const [records, objects] = await Promise.all([
      ctx.prisma.s3File.findMany({ where: { drawingId: drawing.id } }),
      listS3Objects(drawingS3Prefix(ctx.userId, drawing.id)),
    ]);
    const cleanup = buildTrimS3CleanupPlan({ survivingFileIds: plan.survivingFileIds, s3FileRecords: records, s3Objects: objects });
    const deleted = await deleteS3KeysInBatches({ keys: cleanup.orphanKeys, logPrefix: "[mcp/storage/trim]", deleteObject: deleteS3Object });
    s3ObjectsDeleted = deleted.deleted;
    s3DeleteErrors = deleted.errors;
    if (cleanup.orphanFileIds.length) {
      await ctx.prisma.s3File.deleteMany({ where: { drawingId: drawing.id, fileId: { in: cleanup.orphanFileIds } } });
    }
  }
  await ctx.prisma.drawing.update({ where: { id: drawing.id }, data: {
    elements: JSON.stringify(plan.activeElements), files: JSON.stringify(plan.cleanedFiles), version: { increment: 1 },
  } });
  ctx.afterChange(drawing.id);
  return { elementsRemoved: plan.elementsRemoved, filesRemoved: plan.filesRemoved, s3ObjectsDeleted, s3DeleteErrors };
};

export const deleteOrphans = async (ctx: Context, drawing: DrawingRecord, confirmName: string, fileIds: string[]) => {
  if (confirmName !== drawing.name) throw ctx.fail("confirmCanvasName does not match");
  const plan = buildOrphanDeletePlan({ elements: parseJson(drawing.elements, []), files: parseJson(drawing.files, {}), fileIds });
  if (plan.blockedIds.length) throw ctx.fail("Files are referenced by active elements", "INVALID", { blockedFileIds: plan.blockedIds });
  let errors = 0;
  if (isS3Enabled()) {
    const records = await ctx.prisma.s3File.findMany({ where: { drawingId: drawing.id, fileId: { in: fileIds } } });
    const result = await deleteS3KeysInBatches({ keys: records.map((record) => record.s3Key), logPrefix: "[mcp/storage/orphans]", deleteObject: deleteS3Object });
    errors = result.errors;
    await ctx.prisma.s3File.deleteMany({ where: { drawingId: drawing.id, fileId: { in: fileIds } } });
  }
  await ctx.prisma.drawing.update({ where: { id: drawing.id }, data: {
    elements: JSON.stringify(plan.cleanedElements), files: JSON.stringify(plan.cleanedFiles), version: { increment: 1 },
  } });
  ctx.afterChange(drawing.id);
  return { deleted: plan.deletedCount, errors };
};

export const captureScreenshot = (ctx: Context, drawing: DrawingRecord, background = true) => {
  const payload = { requestId: randomUUID(), drawingId: drawing.id, elements: parseJson(drawing.elements, []),
    appState: parseJson(drawing.appState, {}), files: parseJson(drawing.files, {}), background };
  return new Promise<{ data: string; mimeType: "image/png" }>((resolve, reject) => {
    ctx.io.to(`drawing_${drawing.id}`).timeout(8_000).emit("mcp-render-request", payload,
      (error: Error | null, responses: Array<{ data?: string; mimeType?: string }> = []) => {
        const response = responses.find((item) => item?.mimeType === "image/png" && typeof item.data === "string");
        if (error && !response) return reject(ctx.fail("Open this canvas in ExcaliDash to capture a screenshot", "UNAVAILABLE"));
        if (!response?.data) return reject(ctx.fail("The open editor could not render the canvas", "UNAVAILABLE"));
        if (response.data.length > 14_000_000) return reject(ctx.fail("Rendered image is too large"));
        resolve({ data: response.data.replace(/^data:image\/png;base64,/, ""), mimeType: "image/png" });
      });
  });
};
