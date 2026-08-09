import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { buildExternalPluginWorkerSource } from "./externalRuntime";

const startWorker = (pluginSource: string, networkAllowed = false) => {
  const scope: Record<string, any> = {
    postMessage: vi.fn(),
    fetch: vi.fn(),
    XMLHttpRequest: class {},
    WebSocket: class {},
    EventSource: class {},
    importScripts: vi.fn(),
  };
  const source = buildExternalPluginWorkerSource(pluginSource, networkAllowed);
  scope.self = scope;
  runInNewContext(source, scope);
  return scope;
};

describe("external plugin worker", () => {
  it("runs a registered action and returns a structured result", async () => {
    const scope = startWorker(`
      localdrawPlugin.register({
        actions: { caption: ({ prompt }) => ({ message: prompt, elements: [{ type: "text", text: prompt }] }) }
      });
    `);
    await scope.onmessage({ data: { type: "run", requestId: 7, actionId: "caption", input: { prompt: "Hello" } } });
    expect(scope.postMessage).toHaveBeenCalledWith({
      type: "result",
      requestId: 7,
      result: { message: "Hello", elements: [{ type: "text", text: "Hello" }] },
    });
  });

  it("blocks fetch without the network permission", async () => {
    const scope = startWorker(`
      localdrawPlugin.register({ actions: { remote: async () => { await fetch("https://example.com"); } } });
    `);
    await scope.onmessage({ data: { type: "run", requestId: 8, actionId: "remote", input: {} } });
    expect(scope.postMessage).toHaveBeenCalledWith({
      type: "error",
      requestId: 8,
      error: "Plugin does not have the network permission",
    });
  });
});
