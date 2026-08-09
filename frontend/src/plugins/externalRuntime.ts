import type { InstalledPlugin } from "./types";

const MAX_PLUGIN_BYTES = 2 * 1024 * 1024;
const ACTION_TIMEOUT_MS = 60_000;

export type ExternalPluginActionResult = {
  message?: string;
  elements?: unknown[];
  files?: Array<{
    id: string;
    mimeType: string;
    dataURL: string;
    created?: number;
  }>;
};

type Runtime = {
  worker: Worker;
  nextId: number;
  pending: Map<number, {
    resolve: (value: ExternalPluginActionResult) => void;
    reject: (error: Error) => void;
    timeout: number;
  }>;
};

const runtimes = new Map<string, Promise<Runtime>>();

export const buildExternalPluginWorkerSource = (source: string, networkAllowed: boolean): string => `
"use strict";
let definition = null;
const blocked = () => Promise.reject(new Error("Plugin does not have the network permission"));
if (!${JSON.stringify(networkAllowed)}) {
  globalThis.fetch = blocked;
  globalThis.importScripts = undefined;
  globalThis.XMLHttpRequest = undefined;
  globalThis.WebSocket = undefined;
  globalThis.EventSource = undefined;
}
globalThis.localdrawPlugin = Object.freeze({
  register(value) {
    if (definition) throw new Error("Plugin already registered");
    if (!value || typeof value !== "object" || !value.actions || typeof value.actions !== "object") {
      throw new Error("Plugin must register an actions object");
    }
    definition = value;
  }
});
try {
${source}
} catch (error) {
  self.postMessage({ type: "fatal", error: error instanceof Error ? error.message : String(error) });
}
self.onmessage = async (event) => {
  const request = event.data;
  if (!request || request.type !== "run") return;
  try {
    if (!definition) throw new Error("Plugin entry did not call localdrawPlugin.register()");
    const handler = definition.actions[request.actionId];
    if (typeof handler !== "function") throw new Error("Plugin action is not implemented: " + request.actionId);
    const result = await handler(Object.freeze(request.input || {}));
    self.postMessage({ type: "result", requestId: request.requestId, result: result || {} });
  } catch (error) {
    self.postMessage({ type: "error", requestId: request.requestId, error: error instanceof Error ? error.message : String(error) });
  }
};
`;

const createRuntime = async (plugin: InstalledPlugin): Promise<Runtime> => {
  const entry = plugin.manifest.entry;
  if (!entry) throw new Error("Plugin has no entry module");
  const response = await fetch(entry, { credentials: "omit", redirect: "follow" });
  if (!response.ok) throw new Error(`Could not load plugin entry (${response.status})`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_PLUGIN_BYTES) throw new Error("Plugin entry exceeds 2 MiB");
  const source = await response.text();
  if (new TextEncoder().encode(source).byteLength > MAX_PLUGIN_BYTES) throw new Error("Plugin entry exceeds 2 MiB");
  const blob = new Blob([
    buildExternalPluginWorkerSource(source, plugin.manifest.permissions.includes("network")),
  ], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl, { name: plugin.manifest.id });
  URL.revokeObjectURL(blobUrl);
  const runtime: Runtime = { worker, nextId: 1, pending: new Map() };
  worker.onmessage = (event: MessageEvent) => {
    const message = event.data;
    if (message?.type === "fatal") {
      for (const pending of runtime.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(message.error || "Plugin failed to start"));
      }
      runtime.pending.clear();
      return;
    }
    const pending = runtime.pending.get(message?.requestId);
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    runtime.pending.delete(message.requestId);
    if (message.type === "result") pending.resolve(message.result || {});
    else pending.reject(new Error(message.error || "Plugin action failed"));
  };
  worker.onerror = (event) => {
    for (const pending of runtime.pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(event.message || "Plugin worker crashed"));
    }
    runtime.pending.clear();
    runtimes.delete(plugin.manifest.id);
  };
  return runtime;
};

export const runExternalPluginAction = async (
  plugin: InstalledPlugin,
  actionId: string,
  input: Record<string, unknown>,
): Promise<ExternalPluginActionResult> => {
  const runtimePromise = runtimes.get(plugin.manifest.id) || createRuntime(plugin);
  runtimes.set(plugin.manifest.id, runtimePromise);
  const runtime = await runtimePromise;
  const requestId = runtime.nextId++;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      runtime.pending.delete(requestId);
      runtime.worker.terminate();
      runtimes.delete(plugin.manifest.id);
      reject(new Error("Plugin action timed out"));
    }, ACTION_TIMEOUT_MS);
    runtime.pending.set(requestId, { resolve, reject, timeout });
    runtime.worker.postMessage({ type: "run", requestId, actionId, input });
  });
};

export const stopExternalPlugin = (pluginId: string): void => {
  const runtimePromise = runtimes.get(pluginId);
  runtimes.delete(pluginId);
  void runtimePromise?.then((runtime) => runtime.worker.terminate());
};
