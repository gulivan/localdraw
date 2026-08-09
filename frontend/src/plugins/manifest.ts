import {
  PLUGIN_MANIFEST_VERSION,
  type LocalDrawPluginManifest,
  type PluginPermission,
} from "./types";

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const PLUGIN_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const SUPPORTED_PERMISSIONS = new Set<PluginPermission>([
  "canvas:read",
  "canvas:write",
  "network",
  "preferences:read",
  "preferences:write",
]);

const requiredString = (value: unknown, field: string, max = 200): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`Plugin manifest ${field} must be a non-empty string up to ${max} characters`);
  }
  return value.trim();
};

export const resolvePluginManifestUrl = (source: string): URL => {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("Enter a plugin manifest or GitHub URL");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Plugin source must be an HTTPS URL");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Plugin source must use HTTPS");
  }
  if (url.hostname !== "github.com") return url;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("GitHub plugin URL must include an owner and repository");
  const [owner, repositoryWithSuffix] = parts;
  const repository = repositoryWithSuffix.replace(/\.git$/i, "");
  if (parts[2] === "blob" && parts[3]) {
    return new URL(`https://raw.githubusercontent.com/${owner}/${repository}/${parts[3]}/${parts.slice(4).join("/")}`);
  }
  if (parts[2] === "tree" && parts[3]) {
    const directory = parts.slice(4).join("/");
    return new URL(`https://raw.githubusercontent.com/${owner}/${repository}/${parts[3]}/${directory ? `${directory}/` : ""}localdraw.plugin.json`);
  }
  return new URL(`https://raw.githubusercontent.com/${owner}/${repository}/HEAD/localdraw.plugin.json`);
};

export const validatePluginManifest = (
  value: unknown,
  manifestUrl: URL,
): LocalDrawPluginManifest => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Plugin manifest must be a JSON object");
  }
  const input = value as Record<string, unknown>;
  if (input.manifestVersion !== PLUGIN_MANIFEST_VERSION) {
    throw new Error(`Unsupported plugin manifest version; expected ${PLUGIN_MANIFEST_VERSION}`);
  }
  const id = requiredString(input.id, "id", 64);
  if (!PLUGIN_ID.test(id)) throw new Error("Plugin id may contain lowercase letters, numbers, dots, dashes, and underscores");
  if (!Array.isArray(input.permissions)) throw new Error("Plugin manifest permissions must be an array");
  const permissions = input.permissions.map((permission) => {
    if (typeof permission !== "string" || !SUPPORTED_PERMISSIONS.has(permission as PluginPermission)) {
      throw new Error(`Unsupported plugin permission: ${String(permission)}`);
    }
    return permission as PluginPermission;
  });
  let entry: string | undefined;
  if (input.entry !== undefined) {
    entry = new URL(requiredString(input.entry, "entry", 2_000), manifestUrl).href;
    if (!entry.startsWith("https://") && !entry.startsWith("http://localhost") && !entry.startsWith("http://127.0.0.1")) {
      throw new Error("Plugin entry must use HTTPS");
    }
  }
  const rawActions = (input.contributes as Record<string, unknown> | undefined)?.editorActions;
  const editorActions = rawActions === undefined ? undefined : (() => {
    if (!Array.isArray(rawActions)) throw new Error("Plugin editorActions must be an array");
    return rawActions.map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid plugin editor action");
      const action = raw as Record<string, unknown>;
      if (action.selection !== undefined && action.selection !== "optional" && action.selection !== "required") {
        throw new Error("Editor action selection must be optional or required");
      }
      const selection: "optional" | "required" = action.selection === "required" ? "required" : "optional";
      return {
        id: requiredString(action.id, "editor action id", 64),
        label: requiredString(action.label, "editor action label", 80),
        description: action.description === undefined ? undefined : requiredString(action.description, "editor action description", 240),
        selection,
      };
    });
  })();
  return {
    manifestVersion: PLUGIN_MANIFEST_VERSION,
    id,
    name: requiredString(input.name, "name", 100),
    version: requiredString(input.version, "version", 40),
    description: requiredString(input.description, "description", 500),
    author: input.author === undefined ? undefined : requiredString(input.author, "author", 100),
    homepage: input.homepage === undefined ? undefined : new URL(requiredString(input.homepage, "homepage", 2_000), manifestUrl).href,
    entry,
    permissions: [...new Set(permissions)],
    contributes: editorActions ? { editorActions } : undefined,
  };
};

export const fetchPluginManifest = async (source: string): Promise<{
  manifest: LocalDrawPluginManifest;
  manifestUrl: string;
}> => {
  const url = resolvePluginManifestUrl(source);
  const response = await fetch(url, { credentials: "omit", redirect: "follow" });
  if (!response.ok) throw new Error(`Could not load plugin manifest (${response.status})`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_MANIFEST_BYTES) throw new Error("Plugin manifest exceeds 2 MiB");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_MANIFEST_BYTES) throw new Error("Plugin manifest exceeds 2 MiB");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Plugin manifest is not valid JSON");
  }
  return { manifest: validatePluginManifest(value, url), manifestUrl: url.href };
};
