import { randomInt, randomUUID } from "node:crypto";
import type { FilesystemWorkspace } from "./filesystemWorkspace";
import type { LocalApiKeyStore } from "./localApiKeys";

type JsonRecord = Record<string, any>;
type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonRecord;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
};

const objectSchema = (properties: JsonRecord = {}, required: string[] = []): JsonRecord => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const string = { type: "string", minLength: 1 };
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const destructive = { ...write, destructiveHint: true };

const tools: ToolDefinition[] = [
  { name: "list_projects", title: "List LocalDraw projects", description: "List projects, Trash, colors, and canvas counts.", inputSchema: objectSchema(), annotations: read },
  { name: "create_project", title: "Create project", description: "Create a color-coded project, optionally with its first blank canvas.", inputSchema: objectSchema({ name: string, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, createInitialCanvas: { type: "boolean" } }, ["name"]), annotations: write },
  { name: "update_project", title: "Update project", description: "Rename or recolor a project.", inputSchema: objectSchema({ projectId: string, name: string, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } }, ["projectId"]), annotations: write },
  { name: "delete_project", title: "Delete project", description: "Delete a project and move its canvases to Unfiled or Trash.", inputSchema: objectSchema({ projectId: string, canvasDisposition: { type: "string", enum: ["unfiled", "trash"] } }, ["projectId", "canvasDisposition"]), annotations: destructive },
  { name: "list_canvases", title: "List canvases", description: "List or search canvases. Use null for Unfiled or 'trash' for Trash.", inputSchema: objectSchema({ projectId: { type: ["string", "null"] }, search: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 }, offset: { type: "integer", minimum: 0 } }), annotations: read },
  { name: "get_canvas", title: "Get canvas", description: "Read a canvas scene and current version. Embedded image bytes are omitted.", inputSchema: objectSchema({ canvasId: string }, ["canvasId"]), annotations: read },
  { name: "create_canvas", title: "Create canvas", description: "Create a blank canvas in a project or Unfiled.", inputSchema: objectSchema({ name: { type: "string" }, projectId: { type: ["string", "null"] } }), annotations: write },
  { name: "update_canvas_metadata", title: "Rename canvas", description: "Rename a canvas without replacing its scene.", inputSchema: objectSchema({ canvasId: string, name: string }, ["canvasId", "name"]), annotations: write },
  { name: "duplicate_canvas", title: "Duplicate canvas", description: "Duplicate a canvas and its files.", inputSchema: objectSchema({ canvasId: string }, ["canvasId"]), annotations: write },
  { name: "move_canvas", title: "Move canvas", description: "Move and order a canvas in a project or Unfiled.", inputSchema: objectSchema({ canvasId: string, projectId: { type: ["string", "null"] }, targetIndex: { type: "integer", minimum: 0 } }, ["canvasId", "projectId", "targetIndex"]), annotations: write },
  { name: "move_canvas_to_trash", title: "Move canvas to Trash", description: "Move a canvas to Trash without deleting its file.", inputSchema: objectSchema({ canvasId: string }, ["canvasId"]), annotations: destructive },
  { name: "restore_canvas_from_trash", title: "Restore canvas from Trash", description: "Restore a trashed canvas to a project or Unfiled.", inputSchema: objectSchema({ canvasId: string, projectId: { type: ["string", "null"] }, targetIndex: { type: "integer", minimum: 0 } }, ["canvasId", "projectId"]), annotations: write },
  { name: "permanently_delete_canvas", title: "Permanently delete canvas", description: "Permanently delete a canvas already in Trash.", inputSchema: objectSchema({ canvasId: string }, ["canvasId"]), annotations: destructive },
  { name: "list_canvas_history", title: "List canvas history", description: "List restorable snapshots for a canvas.", inputSchema: objectSchema({ canvasId: string, limit: { type: "integer", minimum: 1, maximum: 200 }, offset: { type: "integer", minimum: 0 } }, ["canvasId"]), annotations: read },
  { name: "get_canvas_snapshot", title: "Get canvas snapshot", description: "Read a historical canvas snapshot.", inputSchema: objectSchema({ canvasId: string, snapshotId: string }, ["canvasId", "snapshotId"]), annotations: read },
  { name: "restore_canvas_snapshot", title: "Restore canvas snapshot", description: "Restore a historical canvas scene.", inputSchema: objectSchema({ canvasId: string, snapshotId: string }, ["canvasId", "snapshotId"]), annotations: destructive },
  { name: "describe_canvas", title: "Describe canvas", description: "Return an AI-readable scene summary with IDs, text, and geometry.", inputSchema: objectSchema({ canvasId: string }, ["canvasId"]), annotations: read },
  { name: "query_canvas_elements", title: "Query canvas elements", description: "Find live elements by type, text, or lock state.", inputSchema: objectSchema({ canvasId: string, type: { type: "string" }, text: { type: "string" }, locked: { type: "boolean" } }, ["canvasId"]), annotations: read },
  { name: "apply_canvas_patch", title: "Apply atomic canvas patch", description: "Create, update, and soft-delete canvas elements using an expected canvas version.", inputSchema: objectSchema({ canvasId: string, expectedVersion: { type: "integer", minimum: 1 }, create: { type: "array", items: { type: "object" }, maxItems: 500 }, update: { type: "array", items: { type: "object" }, maxItems: 500 }, delete: { type: "array", items: string, maxItems: 500 } }, ["canvasId", "expectedVersion"]), annotations: destructive },
];

const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
};
const drawingOrThrow = (workspace: FilesystemWorkspace, id: unknown) => {
  const drawing = workspace.getDrawing(requiredText(id, "canvasId"));
  if (!drawing) throw new Error("Canvas not found");
  return drawing;
};
const publicDrawing = (drawing: JsonRecord, scene = false) => ({
  id: drawing.id,
  name: drawing.name,
  projectId: drawing.collectionId,
  sortOrder: drawing.sortOrder,
  version: drawing.version,
  createdAt: drawing.createdAt,
  updatedAt: drawing.updatedAt,
  ...(scene ? {
    elements: drawing.elements,
    appState: drawing.appState,
    files: Object.fromEntries(Object.entries(drawing.files || {}).map(([id, file]: [string, any]) => [id, {
      id,
      mimeType: file?.mimeType ?? null,
      created: file?.created ?? null,
      hasData: typeof file?.dataURL === "string" && file.dataURL.length > 0,
    }])),
  } : {}),
});
const describeElements = (elements: any[]) => elements.filter((element) => !element?.isDeleted).map((element) => ({
  id: element.id,
  type: element.type,
  text: element.text ?? null,
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
  locked: Boolean(element.locked),
  groupIds: Array.isArray(element.groupIds) ? element.groupIds : [],
  startElementId: element.startBinding?.elementId ?? null,
  endElementId: element.endBinding?.elementId ?? null,
}));
const newElement = (input: JsonRecord) => {
  const type = requiredText(input.type, "element type");
  const id = typeof input.id === "string" && input.id ? input.id : randomUUID().replaceAll("-", "").slice(0, 20);
  const base = {
    id, type,
    x: Number(input.x ?? 0), y: Number(input.y ?? 0),
    width: Number(input.width ?? (type === "text" ? 160 : 180)),
    height: Number(input.height ?? (type === "text" ? 30 : 80)),
    angle: Number(input.angle ?? 0),
    strokeColor: input.strokeColor ?? "#1e1e1e",
    backgroundColor: input.backgroundColor ?? "transparent",
    fillStyle: input.fillStyle ?? "solid",
    strokeWidth: Number(input.strokeWidth ?? 2),
    strokeStyle: input.strokeStyle ?? "solid",
    roughness: Number(input.roughness ?? 1),
    opacity: Number(input.opacity ?? 100),
    groupIds: [], frameId: null, roundness: type === "rectangle" ? { type: 3 } : null,
    seed: randomInt(1, 2_147_483_647), version: 1, versionNonce: randomInt(1, 2_147_483_647),
    isDeleted: false, boundElements: null, updated: Date.now(), link: null, locked: Boolean(input.locked),
  } as JsonRecord;
  if (type === "text") Object.assign(base, { text: String(input.text ?? ""), originalText: String(input.text ?? ""), fontSize: Number(input.fontSize ?? 20), fontFamily: Number(input.fontFamily ?? 5), textAlign: "left", verticalAlign: "middle", containerId: null, autoResize: true, lineHeight: 1.25, baseline: Number(input.fontSize ?? 20) });
  if (type === "line" || type === "arrow") Object.assign(base, { points: input.points ?? [[0, 0], [100, 0]], lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: input.startArrowhead ?? null, endArrowhead: type === "arrow" ? input.endArrowhead ?? "arrow" : input.endArrowhead ?? null });
  return base;
};

const runTool = async (workspace: FilesystemWorkspace, name: string, input: JsonRecord): Promise<unknown> => {
  if (name === "list_projects") return { projects: workspace.listCollections(true) };
  if (name === "create_project") return workspace.createCollection(requiredText(input.name, "name"), typeof input.color === "string" ? input.color : "#7c3aed", input.createInitialCanvas === true);
  if (name === "update_project") return workspace.updateCollection(requiredText(input.projectId, "projectId"), { ...(typeof input.name === "string" ? { name: input.name } : {}), ...(typeof input.color === "string" ? { color: input.color } : {}) });
  if (name === "delete_project") { await workspace.deleteCollection(requiredText(input.projectId, "projectId"), input.canvasDisposition === "trash"); return { deletedProjectId: input.projectId, canvasDisposition: input.canvasDisposition }; }
  if (name === "list_canvases") {
    const collectionId = input.projectId === undefined ? undefined : input.projectId;
    const result = workspace.listDrawings({ collectionId, search: typeof input.search === "string" ? input.search : undefined, limit: Number.isInteger(input.limit) ? input.limit : 50, offset: Number.isInteger(input.offset) ? input.offset : 0 });
    return { canvases: result.drawings.map((drawing) => publicDrawing(drawing)), totalCount: result.totalCount, limit: input.limit ?? 50, offset: input.offset ?? 0 };
  }
  if (name === "get_canvas") return publicDrawing(drawingOrThrow(workspace, input.canvasId), true);
  if (name === "create_canvas") return publicDrawing(await workspace.createDrawing(typeof input.name === "string" ? input.name : "Untitled Drawing", input.projectId ?? null), true);
  if (name === "update_canvas_metadata") return publicDrawing(await workspace.updateDrawing(requiredText(input.canvasId, "canvasId"), { name: requiredText(input.name, "name") }));
  if (name === "duplicate_canvas") return publicDrawing(await workspace.duplicateDrawing(requiredText(input.canvasId, "canvasId")), true);
  if (name === "move_canvas") return workspace.placeDrawing(requiredText(input.canvasId, "canvasId"), input.projectId ?? null, Number(input.targetIndex ?? 0));
  if (name === "move_canvas_to_trash") return publicDrawing(await workspace.updateDrawing(requiredText(input.canvasId, "canvasId"), { collectionId: "trash" }));
  if (name === "restore_canvas_from_trash") return workspace.placeDrawing(requiredText(input.canvasId, "canvasId"), input.projectId ?? null, Number(input.targetIndex ?? 0));
  if (name === "permanently_delete_canvas") { const drawing = drawingOrThrow(workspace, input.canvasId); if (drawing.collectionId !== "trash") throw new Error("Canvas must be in Trash before permanent deletion"); await workspace.deleteDrawing(drawing.id); return { permanentlyDeletedCanvasId: drawing.id }; }
  if (name === "list_canvas_history") return workspace.listHistory(requiredText(input.canvasId, "canvasId"), Number(input.limit ?? 50), Number(input.offset ?? 0));
  if (name === "get_canvas_snapshot") { const snapshot = await workspace.getSnapshot(requiredText(input.canvasId, "canvasId"), requiredText(input.snapshotId, "snapshotId")); if (!snapshot) throw new Error("Snapshot not found"); return snapshot; }
  if (name === "restore_canvas_snapshot") return workspace.restoreSnapshot(requiredText(input.canvasId, "canvasId"), requiredText(input.snapshotId, "snapshotId"));
  if (name === "describe_canvas") { const drawing = drawingOrThrow(workspace, input.canvasId); return { canvasId: drawing.id, version: drawing.version, name: drawing.name, elements: describeElements(drawing.elements ?? []) }; }
  if (name === "query_canvas_elements") { const drawing = drawingOrThrow(workspace, input.canvasId); const text = typeof input.text === "string" ? input.text.toLocaleLowerCase() : null; const elements = describeElements(drawing.elements ?? []).filter((element) => (!input.type || element.type === input.type) && (input.locked === undefined || element.locked === input.locked) && (!text || String(element.text || "").toLocaleLowerCase().includes(text))); return { canvasId: drawing.id, version: drawing.version, elements }; }
  if (name === "apply_canvas_patch") {
    const drawing = drawingOrThrow(workspace, input.canvasId);
    if (drawing.version !== input.expectedVersion) throw new Error(`Canvas version conflict; current version is ${drawing.version}`);
    const elements = structuredClone(drawing.elements ?? []) as JsonRecord[];
    const changedIds: string[] = [];
    for (const create of Array.isArray(input.create) ? input.create : []) { const element = newElement(create); if (elements.some((current) => current.id === element.id && !current.isDeleted)) throw new Error(`Element ${element.id} already exists`); elements.push(element); changedIds.push(element.id); }
    for (const update of Array.isArray(input.update) ? input.update : []) { const id = requiredText(update.id, "element id"); const element = elements.find((candidate) => candidate.id === id && !candidate.isDeleted); if (!element) throw new Error(`Element ${id} not found`); const { id: _id, type: _type, ...changes } = update; Object.assign(element, changes, { version: Number(element.version ?? 0) + 1, versionNonce: randomInt(1, 2_147_483_647), updated: Date.now() }); changedIds.push(id); }
    for (const id of Array.isArray(input.delete) ? input.delete : []) { const element = elements.find((candidate) => candidate.id === id && !candidate.isDeleted); if (!element) throw new Error(`Element ${id} not found`); Object.assign(element, { isDeleted: true, version: Number(element.version ?? 0) + 1, versionNonce: randomInt(1, 2_147_483_647), updated: Date.now() }); changedIds.push(id); }
    if (changedIds.length === 0) throw new Error("Patch has no operations");
    const updated = await workspace.updateDrawing(drawing.id, { elements, version: drawing.version });
    return { canvasId: drawing.id, previousVersion: drawing.version, version: updated.version, changedIds: [...new Set(changedIds)] };
  }
  throw new Error(`Unknown tool: ${name}`);
};

const toolResult = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value && typeof value === "object" && !Array.isArray(value) ? value : { value } });
const toolError = (error: unknown) => { const payload = { error: "TOOL_ERROR", message: error instanceof Error ? error.message : "Tool failed" }; return { isError: true, content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload }; };

export class LocalMcpServer {
  private readonly sessions = new Set<string>();

  constructor(private readonly workspace: FilesystemWorkspace, private readonly keys: LocalApiKeyStore, private readonly version: string) {}

  async handle(request: Request): Promise<Response> {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token || !(await this.keys.authenticate(token))) return Response.json({ error: "Unauthorized", message: "MCP bearer API key required" }, { status: 401 });
    if (request.method === "GET") return Response.json({ error: "SSE stream not supported" }, { status: 405 });
    const sessionId = request.headers.get("mcp-session-id");
    if (request.method === "DELETE") { if (sessionId) this.sessions.delete(sessionId); return new Response(null, { status: 204 }); }
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const message = await request.json() as JsonRecord;
    if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (message.method === "initialize") {
      const nextSessionId = randomUUID();
      this.sessions.add(nextSessionId);
      return Response.json({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "localdraw", version: this.version }, instructions: "LocalDraw is a filesystem-native Excalidraw workspace. Read a canvas and retain its version before editing. Ask before Trash, permanent deletion, project deletion, or history restoration." } }, { headers: { "mcp-session-id": nextSessionId } });
    }
    if (!sessionId || !this.sessions.has(sessionId)) return Response.json({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32001, message: "Invalid MCP session" } }, { status: 404 });
    if (message.method === "ping") return Response.json({ jsonrpc: "2.0", id: message.id, result: {} });
    if (message.method === "tools/list") return Response.json({ jsonrpc: "2.0", id: message.id, result: { tools } });
    if (message.method === "tools/call") {
      const name = requiredText(message.params?.name, "tool name");
      let result: unknown;
      try { result = toolResult(await runTool(this.workspace, name, message.params?.arguments || {})); } catch (error) { result = toolError(error); }
      return Response.json({ jsonrpc: "2.0", id: message.id, result });
    }
    return Response.json({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32601, message: "Method not found" } });
  }
}
