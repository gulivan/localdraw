import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ensureLocalDrawReady } from "../lib/mcp-bridge.js";

const launcherEntry = resolve(import.meta.dirname, "../bin/localdraw.js");

const listen = async (handler) => {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/api/mcp`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
};

const readJson = async (request) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
};

const sendJson = (response, body, status = 200, headers = {}) => {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
};

test("local bridge launches the desktop app and waits when its endpoint is offline", async () => {
  const calls = [];
  await ensureLocalDrawReady({
    url: new URL("http://127.0.0.1:32144/api/mcp"),
    launcherEntry: "/fake/localdraw.js",
    probe: async () => ({ kind: "available" }),
    launch: async (entry) => { calls.push(["launch", entry]); },
    awaitReady: async () => { calls.push(["ready"]); },
  });
  assert.deepEqual(calls, [["launch", "/fake/localdraw.js"], ["ready"]]);
});

test("remote bridge does not try to launch the desktop app", async () => {
  let launched = false;
  await ensureLocalDrawReady({
    url: new URL("https://draw.example.test/api/mcp"),
    launcherEntry: "/fake/localdraw.js",
    probe: async () => { throw new Error("should not probe"); },
    launch: async () => { launched = true; },
  });
  assert.equal(launched, false);
});

test("stdio bridge initializes and proxies tool list and calls", async (t) => {
  const authorizationHeaders = [];
  const upstream = await listen(async (request, response) => {
    authorizationHeaders.push(request.headers.authorization);
    if (request.method === "DELETE") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "GET") {
      response.writeHead(405);
      response.end();
      return;
    }
    const message = await readJson(request);
    if (message.method === "notifications/initialized") {
      response.writeHead(202).end();
      return;
    }
    if (message.method === "initialize") {
      sendJson(response, {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "fake-localdraw", version: "1.2.3" },
          instructions: "Fake LocalDraw instructions",
        },
      }, 200, { "mcp-session-id": "test-session" });
      return;
    }
    if (message.method === "tools/list") {
      sendJson(response, {
        jsonrpc: "2.0",
        id: message.id,
        result: { tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }] },
      });
      return;
    }
    if (message.method === "tools/call") {
      sendJson(response, {
        jsonrpc: "2.0",
        id: message.id,
        result: { content: [{ type: "text", text: JSON.stringify(message.params.arguments) }] },
      });
      return;
    }
    sendJson(response, { jsonrpc: "2.0", id: message.id ?? null, error: { code: -32601, message: "Unknown" } });
  });
  t.after(async () => {
    upstream.server.closeAllConnections();
    await upstream.close();
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [launcherEntry, "--", "mcp-bridge"],
    env: { LOCALDRAW_MCP_URL: upstream.url, LOCALDRAW_MCP_TOKEN: "exd_bridge-test" },
    stderr: "pipe",
  });
  const client = new Client({ name: "bridge-test", version: "1.0.0" }, { capabilities: {} });
  t.after(() => client.close());
  await client.connect(transport);

  assert.deepEqual(client.getServerVersion(), { name: "fake-localdraw", version: "1.2.3" });
  assert.equal(client.getInstructions(), "Fake LocalDraw instructions");
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["echo"]);
  assert.equal((await client.callTool({ name: "echo", arguments: { value: 42 } })).content[0].text, '{"value":42}');
  assert.ok(authorizationHeaders.length >= 3);
  assert.ok(authorizationHeaders.every((value) => value === "Bearer exd_bridge-test"));
}, { timeout: 10_000 });

test("stdio bridge explains rejected bearer keys", async (t) => {
  const upstream = await listen((_request, response) => {
    sendJson(response, { error: "Unauthorized", message: "MCP bearer API key required" }, 401);
  });
  t.after(async () => {
    upstream.server.closeAllConnections();
    await upstream.close();
  });

  const child = spawn(process.execPath, [launcherEntry, "--", "mcp-bridge"], {
    env: { ...process.env, LOCALDRAW_MCP_URL: upstream.url, LOCALDRAW_MCP_TOKEN: "revoked" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");

  assert.equal(code, 1);
  assert.match(stderr, /rejected the MCP key/i);
  assert.match(stderr, /Settings → Plugins → Connect AI/);
});
