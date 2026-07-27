import {
  FileConflictError,
  FilesystemWorkspace,
  type DrawingUpdate,
} from "./filesystemWorkspace";

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const errorStatus = (error: unknown): number => {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("not found")) return 404;
  if (message.includes("Conflict")) return 409;
  if (message.includes("Invalid") || message.includes("must") || message.includes("required")) return 400;
  return 500;
};

const readBody = async (request: Request): Promise<Record<string, any>> => {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 50 * 1024 * 1024) throw new Error("Request exceeds 50 MiB limit");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > 50 * 1024 * 1024) {
    throw new Error("Request exceeds 50 MiB limit");
  }
  const value = parseJsonBody(bytes);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
};

const parseJsonBody = (bytes: Uint8Array): unknown => {
  if (bytes.byteLength === 0) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Invalid JSON request body");
  }
};

const integer = (value: string | null, fallback?: number): number | undefined => {
  if (value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((total, item) => total + item.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const storedZip = (entries: Array<{ name: string; data: Uint8Array }>): Uint8Array => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length + entry.data.length;
  }
  const central = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, localOffset, true);
  return concatBytes([...localParts, central, end]);
};

export const createLocalApi = (
  workspace: FilesystemWorkspace,
  version: string,
  expectedOrigin?: string,
) => async (request: Request): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  const path = decodeURIComponent(url.pathname.slice(4));
  const method = request.method.toUpperCase();

  try {
    const origin = request.headers.get("origin");
    if (
      expectedOrigin &&
      origin &&
      origin !== expectedOrigin &&
      method !== "GET" &&
      method !== "HEAD"
    ) {
      return json({ error: "Forbidden" }, 403);
    }
    if (method === "GET" && path === "/csrf-token") {
      return json({ token: "localdraw", header: "x-csrf-token" });
    }
    if (method === "GET" && path === "/auth/status") {
      return json({
        enabled: false,
        authEnabled: false,
        registrationEnabled: false,
        authMode: "local",
        oidcEnabled: false,
        oidcEnforced: false,
        oidcProvider: null,
        bootstrapRequired: false,
        authOnboardingRequired: false,
        authOnboardingMode: null,
      });
    }
    if (method === "GET" && path === "/auth/me") {
      return json({ user: { id: "localdraw", email: "local@localdraw.invalid", name: "LocalDraw" } });
    }
    if (method === "POST" && (path === "/auth/refresh" || path === "/auth/logout")) {
      return json({ ok: true });
    }
    if (path === "/auth/preferences") {
      if (method === "GET") return json({ preferences: await workspace.getPreferences() });
      if (method === "PUT") return json({ preferences: await workspace.updatePreferences(await readBody(request)) });
    }
    if (method === "GET" && path === "/files/config") return json({ s3Enabled: false });
    if (method === "GET" && path === "/system/update") {
      return json({
        currentVersion: version,
        channel: url.searchParams.get("channel") === "prerelease" ? "prerelease" : "stable",
        outboundEnabled: false,
        latestVersion: null,
        latestUrl: null,
        publishedAt: null,
        isUpdateAvailable: null,
      });
    }
    if (workspace.getStatus().state !== "ready") {
      return json({
        error: "Drawing folder unavailable",
        state: workspace.getStatus().state,
      }, 503);
    }
    if (method === "GET" && path === "/export/excalidash") {
      const archive = storedZip(await workspace.archiveEntries());
      const date = new Date().toISOString().slice(0, 10);
      const suffix = url.searchParams.get("ext") === "zip" ? ".localdraw.zip" : ".localdraw";
      return new Response(archive.buffer as ArrayBuffer, {
        headers: {
          "Content-Disposition": `attachment; filename="localdraw-backup-${date}${suffix}"`,
          "Content-Type": "application/zip",
        },
      });
    }

    if (path === "/library") {
      if (method === "GET") return json({ items: await workspace.getLibrary() });
      if (method === "PUT") {
        const body = await readBody(request);
        if (!Array.isArray(body.items)) return json({ error: "Items must be an array" }, 400);
        return json({ items: await workspace.updateLibrary(body.items) });
      }
    }

    if (path === "/collections") {
      if (method === "GET") {
        return json(workspace.listCollections(url.searchParams.get("includeOverview") === "true"));
      }
      if (method === "POST") {
        const body = await readBody(request);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 100) return json({ error: "Invalid project name" }, 400);
        const color = typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color)
          ? body.color.toLowerCase()
          : "#7c3aed";
        return json(await workspace.createCollection(name, color, body.createInitialDrawing === true));
      }
    }

    const collectionMatch = path.match(/^\/collections\/([^/]+)$/);
    if (collectionMatch) {
      const id = collectionMatch[1];
      if (id === "trash") return json({ error: "Trash cannot be changed" }, 400);
      if (method === "PUT") {
        const body = await readBody(request);
        const hasName = body.name !== undefined;
        const hasColor = body.color !== undefined;
        if (!hasName && !hasColor) return json({ error: "No project changes supplied" }, 400);
        if (hasName && (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100)) {
          return json({ error: "Invalid project name" }, 400);
        }
        if (hasColor && (typeof body.color !== "string" || !/^#[0-9a-f]{6}$/i.test(body.color))) {
          return json({ error: "Invalid project color" }, 400);
        }
        return json(await workspace.updateCollection(id, {
          ...(hasName ? { name: body.name.trim() } : {}),
          ...(hasColor ? { color: body.color.toLowerCase() } : {}),
        }));
      }
      if (method === "DELETE") {
        await workspace.deleteCollection(id, url.searchParams.get("deleteSlides") === "true");
        return json({ success: true });
      }
    }

    if (path === "/drawings") {
      if (method === "GET") {
        const rawCollection = url.searchParams.get("collectionId");
        const collectionId = rawCollection === null
          ? undefined
          : rawCollection === "null" ? null : rawCollection;
        const rawSortField = url.searchParams.get("sortField");
        const sortField = rawSortField === "name" || rawSortField === "createdAt" ||
          rawSortField === "updatedAt" || rawSortField === "sortOrder"
          ? rawSortField
          : undefined;
        const rawSortDirection = url.searchParams.get("sortDirection");
        const sortDirection = rawSortDirection === "asc" || rawSortDirection === "desc"
          ? rawSortDirection
          : undefined;
        return json(workspace.listDrawings({
          search: url.searchParams.get("search") || undefined,
          collectionId,
          includeData: url.searchParams.get("includeData") === "true",
          includePreview: url.searchParams.get("includePreview") === "true",
          limit: integer(url.searchParams.get("limit")),
          offset: integer(url.searchParams.get("offset"), 0),
          sortField,
          sortDirection,
        }));
      }
      if (method === "POST") {
        const body = await readBody(request);
        const name = typeof body.name === "string" ? body.name.trim() : "Untitled Drawing";
        if (!name || name.length > 100) return json({ error: "Invalid canvas name" }, 400);
        const collectionId = body.collectionId === null || typeof body.collectionId === "string"
          ? body.collectionId
          : null;
        const created = await workspace.createDrawing(
          name,
          collectionId,
          {
            elements: Array.isArray(body.elements) ? body.elements : [],
            appState: body.appState && typeof body.appState === "object" ? body.appState : {},
            files: body.files && typeof body.files === "object" ? body.files : {},
            preview: typeof body.preview === "string" ? body.preview : null,
          },
        );
        return json(created);
      }
    }

    const placementMatch = path.match(/^\/drawings\/([^/]+)\/placement$/);
    if (placementMatch && method === "PATCH") {
      const body = await readBody(request);
      if (
        (body.collectionId !== null && typeof body.collectionId !== "string") ||
        !Number.isInteger(body.targetIndex) ||
        body.targetIndex < 0
      ) {
        return json({ error: "Invalid canvas placement" }, 400);
      }
      return json(await workspace.placeDrawing(placementMatch[1], body.collectionId, body.targetIndex));
    }

    const duplicateMatch = path.match(/^\/drawings\/([^/]+)\/duplicate$/);
    if (duplicateMatch && method === "POST") {
      return json(await workspace.duplicateDrawing(duplicateMatch[1]));
    }

    const restoreMatch = path.match(/^\/drawings\/([^/]+)\/history\/([^/]+)\/restore$/);
    if (restoreMatch && method === "POST") {
      return json(await workspace.restoreSnapshot(restoreMatch[1], restoreMatch[2]));
    }

    const snapshotMatch = path.match(/^\/drawings\/([^/]+)\/history\/([^/]+)$/);
    if (snapshotMatch && method === "GET") {
      const snapshot = await workspace.getSnapshot(snapshotMatch[1], snapshotMatch[2]);
      return snapshot ? json(snapshot) : json({ error: "Snapshot not found" }, 404);
    }

    const historyMatch = path.match(/^\/drawings\/([^/]+)\/history$/);
    if (historyMatch && method === "GET") {
      return json(await workspace.listHistory(
        historyMatch[1],
        integer(url.searchParams.get("limit"), 100),
        integer(url.searchParams.get("offset"), 0),
      ));
    }

    const drawingMatch = path.match(/^\/drawings\/([^/]+)$/);
    if (drawingMatch) {
      const id = drawingMatch[1];
      if (method === "GET") {
        const drawing = workspace.getDrawing(id);
        return drawing ? json(drawing) : json({ error: "Drawing not found" }, 404);
      }
      if (method === "PUT") {
        const body = await readBody(request);
        const update: DrawingUpdate = {};
        if (body.name !== undefined) {
          if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
            return json({ error: "Invalid canvas name" }, 400);
          }
          update.name = body.name.trim();
        }
        if (body.elements !== undefined) {
          if (!Array.isArray(body.elements)) return json({ error: "Invalid canvas elements" }, 400);
          update.elements = body.elements;
        }
        for (const field of ["appState", "files"] as const) {
          if (body[field] === undefined) continue;
          if (!body[field] || typeof body[field] !== "object" || Array.isArray(body[field])) {
            return json({ error: `Invalid ${field}` }, 400);
          }
          update[field] = body[field];
        }
        if (body.preview !== undefined) {
          if (body.preview !== null && typeof body.preview !== "string") {
            return json({ error: "Invalid preview" }, 400);
          }
          update.preview = body.preview;
        }
        if (body.collectionId !== undefined) {
          if (body.collectionId !== null && typeof body.collectionId !== "string") {
            return json({ error: "Invalid project" }, 400);
          }
          update.collectionId = body.collectionId;
        }
        if (body.version !== undefined) {
          if (!Number.isInteger(body.version) || body.version < 1) {
            return json({ error: "Invalid canvas version" }, 400);
          }
          update.version = body.version;
        }
        if (Object.keys(update).length === 0) return json({ error: "No canvas changes supplied" }, 400);
        return json(await workspace.updateDrawing(id, update));
      }
      if (method === "DELETE") {
        const expected = url.searchParams.get("expectedUpdatedAt");
        const onlyIfUntouched = url.searchParams.get("ifUntouched") === "true";
        if (onlyIfUntouched && !expected) {
          return json({ error: "expectedUpdatedAt is required" }, 400);
        }
        const expectedTime = expected ? new Date(expected).getTime() : undefined;
        if (onlyIfUntouched && !Number.isFinite(expectedTime)) {
          return json({ error: "expectedUpdatedAt is invalid" }, 400);
        }
        const deleted = await workspace.deleteDrawing(
          id,
          onlyIfUntouched ? expectedTime : undefined,
        );
        return json(onlyIfUntouched
          ? { success: true, deleted }
          : { success: true });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof FileConflictError) {
      return json({
        error: "Conflict",
        code: "FILE_CONFLICT",
        message: error.message,
        drawingId: error.drawingId,
        conflictPath: error.conflictPath,
        currentVersion: error.currentVersion,
      }, 409);
    }
    console.error("[local-api] request failed", { method, path, error });
    return json({
      error: error instanceof Error ? error.message : "Local workspace operation failed",
    }, errorStatus(error));
  }
};
