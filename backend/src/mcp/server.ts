import { randomUUID } from "crypto";
import type express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import type { AuthModeService } from "../auth/authMode";
import { createMcpApiKeyMiddleware } from "../auth/mcpApiKeyAuth";
import type { PrismaClient } from "../generated/client";
import type { Server as SocketIoServer } from "socket.io";
import { createElementSchema, updateElementSchema } from "./canvasElements";
import { McpWorkspace, McpWorkspaceError } from "./workspace";

export type RegisterMcpDeps = {
  prisma: PrismaClient;
  io: SocketIoServer;
  authModeService: AuthModeService;
  invalidateDrawingsCache: () => void;
  version: string;
};

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
const destructiveAnnotations = {
  ...writeAnnotations,
  destructiveHint: true,
} as const;

const toolResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : { value },
});

const toolError = (error: unknown) => {
  const known = error instanceof McpWorkspaceError ? error : null;
  const payload = {
    error: known?.code ?? "INTERNAL",
    message: error instanceof Error ? error.message : "Unexpected MCP tool error",
    ...(known?.details ?? {}),
  };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
};

const register = (
  server: McpServer,
  name: string,
  config: Parameters<McpServer["registerTool"]>[1],
  callback: (input: any) => Promise<unknown>,
) => server.registerTool(name, config as any, async (input: any) => {
  try {
    return toolResult(await callback(input));
  } catch (error) {
    return toolError(error);
  }
});

const createUserServer = (workspace: McpWorkspace, version: string) => {
  const server = new McpServer(
    { name: "excalidash", version },
    {
      instructions:
        "ExcaliDash is a persistent project and Excalidraw canvas workspace. Read a canvas and retain its version before editing. Use apply_canvas_patch for atomic element changes, then describe_canvas and capture_canvas_screenshot when an editor is open. Destructive tools affect Trash, history, or storage and should only run after user approval. Never replace files or appState through element tools.",
    },
  );

  register(server, "list_projects", {
    title: "List ExcaliDash projects",
    description: "List the user's projects, Trash, colors, and canvas counts.",
    annotations: readAnnotations,
  }, () => workspace.listProjects());
  register(server, "create_project", {
    title: "Create project",
    description: "Create a color-coded project, optionally with its first blank canvas.",
    inputSchema: {
      name: z.string().min(1).max(100),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      createInitialCanvas: z.boolean().optional(),
    },
    annotations: writeAnnotations,
  }, (input) => workspace.createProject(input));
  register(server, "update_project", {
    title: "Update project",
    description: "Rename or recolor an owned project.",
    inputSchema: {
      projectId: z.string().min(1),
      name: z.string().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    },
    annotations: writeAnnotations,
  }, (input) => workspace.updateProject(input));
  register(server, "delete_project", {
    title: "Delete project",
    description: "Delete a project and explicitly move its canvases to Unfiled or Trash.",
    inputSchema: {
      projectId: z.string().min(1),
      canvasDisposition: z.enum(["unfiled", "trash"]),
    },
    annotations: destructiveAnnotations,
  }, (input) => workspace.deleteProject(input));

  register(server, "list_canvases", {
    title: "List canvases",
    description: "List or search canvas metadata. Omit projectId for active canvases, use null for Unfiled, or 'trash' for Trash.",
    inputSchema: {
      projectId: z.string().nullable().optional(),
      search: z.string().max(255).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
    annotations: readAnnotations,
  }, (input) => workspace.listCanvases(input));
  register(server, "get_canvas", {
    title: "Get canvas",
    description: "Read a canvas scene and its current version. Embedded image bytes are omitted.",
    inputSchema: { canvasId: z.string().min(1) },
    annotations: readAnnotations,
  }, ({ canvasId }) => workspace.getCanvas(canvasId));
  register(server, "create_canvas", {
    title: "Create canvas",
    description: "Create a blank canvas in a project or Unfiled.",
    inputSchema: {
      name: z.string().min(1).max(255).optional(),
      projectId: z.string().nullable().optional(),
    },
    annotations: writeAnnotations,
  }, (input) => workspace.createCanvas(input));
  register(server, "update_canvas_metadata", {
    title: "Rename canvas",
    description: "Rename an owned canvas without replacing its scene.",
    inputSchema: { canvasId: z.string().min(1), name: z.string().min(1).max(255) },
    annotations: writeAnnotations,
  }, (input) => workspace.updateCanvasMetadata(input));
  register(server, "duplicate_canvas", {
    title: "Duplicate canvas",
    description: "Duplicate a canvas and its persisted files.",
    inputSchema: { canvasId: z.string().min(1) },
    annotations: writeAnnotations,
  }, ({ canvasId }) => workspace.duplicateCanvas(canvasId));
  register(server, "move_canvas", {
    title: "Move canvas",
    description: "Move and order an active canvas in a project or Unfiled.",
    inputSchema: {
      canvasId: z.string().min(1),
      projectId: z.string().nullable(),
      targetIndex: z.number().int().min(0),
    },
    annotations: writeAnnotations,
  }, (input) => workspace.moveCanvas(input));
  register(server, "move_canvas_to_trash", {
    title: "Move canvas to Trash",
    description: "Move an owned canvas to Trash without permanently deleting it.",
    inputSchema: { canvasId: z.string().min(1) },
    annotations: destructiveAnnotations,
  }, ({ canvasId }) => workspace.moveCanvasToTrash(canvasId));
  register(server, "restore_canvas_from_trash", {
    title: "Restore canvas from Trash",
    description: "Restore a trashed canvas to a project or Unfiled.",
    inputSchema: {
      canvasId: z.string().min(1),
      projectId: z.string().nullable(),
      targetIndex: z.number().int().min(0).optional(),
    },
    annotations: writeAnnotations,
  }, (input) => workspace.restoreCanvasFromTrash(input));
  register(server, "permanently_delete_canvas", {
    title: "Permanently delete canvas",
    description: "Permanently delete a canvas that is already in Trash, including its stored files.",
    inputSchema: { canvasId: z.string().min(1) },
    annotations: destructiveAnnotations,
  }, ({ canvasId }) => workspace.permanentlyDeleteCanvas(canvasId));

  register(server, "list_canvas_history", {
    title: "List canvas history",
    description: "List restorable snapshots for a canvas.",
    inputSchema: {
      canvasId: z.string().min(1),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
    annotations: readAnnotations,
  }, (input) => workspace.listCanvasHistory(input));
  register(server, "get_canvas_snapshot", {
    title: "Get canvas snapshot",
    description: "Read one historical canvas snapshot.",
    inputSchema: { canvasId: z.string().min(1), snapshotId: z.string().min(1) },
    annotations: readAnnotations,
  }, (input) => workspace.getCanvasSnapshot(input));
  register(server, "restore_canvas_snapshot", {
    title: "Restore canvas snapshot",
    description: "Snapshot the current scene, then restore a historical scene.",
    inputSchema: { canvasId: z.string().min(1), snapshotId: z.string().min(1) },
    annotations: destructiveAnnotations,
  }, (input) => workspace.restoreCanvasSnapshot(input));

  register(server, "describe_canvas", {
    title: "Describe canvas",
    description: "Return an AI-readable scene summary with IDs, labels, geometry, groups, locks, and arrow connections.",
    inputSchema: { canvasId: z.string().min(1) },
    annotations: readAnnotations,
  }, ({ canvasId }) => workspace.describeCanvas(canvasId));
  register(server, "query_canvas_elements", {
    title: "Query canvas elements",
    description: "Find live elements by type, text, lock state, or intersecting bounding box.",
    inputSchema: {
      canvasId: z.string().min(1),
      type: z.enum(["rectangle", "ellipse", "diamond", "text", "line", "arrow", "image", "freedraw"]).optional(),
      text: z.string().max(500).optional(),
      locked: z.boolean().optional(),
      bbox: z.object({ xMin: z.number(), yMin: z.number(), xMax: z.number(), yMax: z.number() }).optional(),
    },
    annotations: readAnnotations,
  }, (input) => workspace.queryCanvasElements(input));
  register(server, "apply_canvas_patch", {
    title: "Apply atomic canvas patch",
    description: "Atomically create, update, and soft-delete canvas elements. Requires the version returned by get_canvas or describe_canvas. Shape text creates a bound label; arrows can bind with startElementId/endElementId.",
    inputSchema: {
      canvasId: z.string().min(1),
      expectedVersion: z.number().int().positive(),
      create: z.array(createElementSchema).max(500).optional(),
      update: z.array(updateElementSchema).max(500).optional(),
      delete: z.array(z.string().min(1)).max(500).optional(),
    },
    annotations: destructiveAnnotations,
  }, (input) => workspace.applyCanvasPatch(input));
  register(server, "arrange_canvas_elements", {
    title: "Arrange canvas elements",
    description: "Align, distribute, group, ungroup, lock, unlock, or duplicate existing elements in one versioned change.",
    inputSchema: {
      canvasId: z.string().min(1),
      expectedVersion: z.number().int().positive(),
      action: z.enum(["align", "distribute", "group", "ungroup", "lock", "unlock", "duplicate"]),
      elementIds: z.array(z.string().min(1)).min(1).max(500),
      alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]).optional(),
      direction: z.enum(["horizontal", "vertical"]).optional(),
      groupId: z.string().min(1).optional(),
      offsetX: z.number().finite().optional(),
      offsetY: z.number().finite().optional(),
    },
    annotations: writeAnnotations,
  }, (input) => workspace.arrangeCanvasElements(input));
  server.registerTool("capture_canvas_screenshot", {
    title: "Capture canvas screenshot",
    description: "Render the persisted canvas to PNG through an open ExcaliDash editor. Open the requested canvas first.",
    inputSchema: { canvasId: z.string().min(1), background: z.boolean().optional() },
    annotations: readAnnotations,
  }, async (input: any) => {
    try {
      const image = await workspace.captureCanvasScreenshot(input);
      return {
        content: [
          { type: "image" as const, data: image.data, mimeType: image.mimeType },
          { type: "text" as const, text: "Rendered the persisted ExcaliDash canvas." },
        ],
        structuredContent: { canvasId: input.canvasId, mimeType: image.mimeType },
      };
    } catch (error) {
      return toolError(error);
    }
  });

  register(server, "inspect_canvas_storage", {
    title: "Inspect canvas storage",
    description: "Compare active/deleted canvas references, SQLite file metadata, and S3 objects.",
    inputSchema: { canvasId: z.string().min(1) },
    annotations: readAnnotations,
  }, ({ canvasId }) => workspace.inspectCanvasStorage(canvasId));
  register(server, "trim_canvas_storage", {
    title: "Trim canvas storage",
    description: "Permanently remove deleted elements and their orphaned persisted files. confirmCanvasName must exactly match.",
    inputSchema: { canvasId: z.string().min(1), confirmCanvasName: z.string().min(1) },
    annotations: destructiveAnnotations,
  }, (input) => workspace.trimCanvasStorage(input));
  register(server, "delete_canvas_orphan_files", {
    title: "Delete orphan canvas files",
    description: "Delete selected files that are not referenced by active elements. confirmCanvasName must exactly match.",
    inputSchema: {
      canvasId: z.string().min(1),
      confirmCanvasName: z.string().min(1),
      fileIds: z.array(z.string().regex(/^[\w-]{1,200}$/)).min(1).max(500),
    },
    annotations: destructiveAnnotations,
  }, (input) => workspace.deleteCanvasOrphanFiles(input));

  return server;
};

type Session = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  apiKeyId: string;
  userId: string;
  lastUsedAt: number;
};

export const registerMcpServer = (app: express.Express, deps: RegisterMcpDeps) => {
  const authenticate = createMcpApiKeyMiddleware(deps.prisma, deps.authModeService);
  const sessions = new Map<string, Session>();

  const resolveSession = (req: express.Request, res: express.Response): Session | null => {
    const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;
    const session = sessionId ? sessions.get(sessionId) : null;
    if (!session || !req.mcpPrincipal || session.apiKeyId !== req.mcpPrincipal.apiKeyId || session.userId !== req.mcpPrincipal.userId) {
      res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid MCP session" }, id: null });
      return null;
    }
    session.lastUsedAt = Date.now();
    return session;
  };

  app.post("/mcp", authenticate, async (req, res) => {
    try {
      const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;
      if (sessionId) {
        const session = resolveSession(req, res);
        if (session) await session.transport.handleRequest(req, res, req.body);
        return;
      }
      if (!isInitializeRequest(req.body) || !req.mcpPrincipal) {
        return res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Initialize request required" }, id: null });
      }
      let transport!: StreamableHTTPServerTransport;
      let server!: McpServer;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: (initializedId) => {
          sessions.set(initializedId, {
            transport,
            server,
            apiKeyId: req.mcpPrincipal!.apiKeyId,
            userId: req.mcpPrincipal!.userId,
            lastUsedAt: Date.now(),
          });
        },
      });
      server = createUserServer(new McpWorkspace(req.mcpPrincipal.userId, deps), deps.version);
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal MCP server error" }, id: null });
    }
  });
  app.get("/mcp", authenticate, async (req, res) => {
    const session = resolveSession(req, res);
    if (session) await session.transport.handleRequest(req, res);
  });
  app.delete("/mcp", authenticate, async (req, res) => {
    const session = resolveSession(req, res);
    if (session) await session.transport.handleRequest(req, res);
  });

  const cleanup = setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, session] of sessions) {
      if (session.lastUsedAt < cutoff) {
        sessions.delete(id);
        void session.server.close();
      }
    }
  }, 5 * 60 * 1000);
  cleanup.unref();
};
