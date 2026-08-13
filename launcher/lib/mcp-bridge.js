import { spawn } from "node:child_process";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { LOCALDRAW_URL } from "./cli.js";
import { probeLocalDrawInstance } from "./instance.js";
import { resolveConfig } from "./mcp-cli.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isLocalDesktopMcpUrl = (url) =>
  url.protocol === "http:" &&
  url.hostname === "127.0.0.1" &&
  url.port === "32144" &&
  url.pathname.replace(/\/$/, "") === "/api/mcp";

const waitForLocalDraw = async (timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  let last = { kind: "available" };
  while (Date.now() < deadline) {
    last = await probeLocalDrawInstance({ baseUrl: LOCALDRAW_URL });
    if (last.kind === "localdraw") return last;
    if (last.kind === "occupied") throw new Error("Port 32144 is occupied by another program.");
    await wait(200);
  }
  throw new Error(`LocalDraw did not become ready within ${Math.round(timeoutMs / 1000)} seconds (last state: ${last.kind}).`);
};

const startLauncher = (launcherEntry) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [launcherEntry], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stderr.write(`[localdraw] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[localdraw] ${chunk}`));
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`LocalDraw launcher exited ${signal ? `with ${signal}` : `with status ${code}`}.`));
  });
});

export const ensureLocalDrawReady = async ({
  url,
  launcherEntry,
  probe = probeLocalDrawInstance,
  launch = startLauncher,
  awaitReady = waitForLocalDraw,
}) => {
  if (!isLocalDesktopMcpUrl(url)) return;
  const state = await probe({ baseUrl: LOCALDRAW_URL });
  if (state.kind === "localdraw") return;
  if (state.kind === "occupied") throw new Error("Port 32144 is occupied by another program, so the LocalDraw MCP bridge cannot start the app.");
  process.stderr.write("[localdraw] Desktop app is not running; starting it now…\n");
  await launch(launcherEntry);
  await awaitReady();
};

const connectUpstream = async ({ url, token }) => {
  const client = new Client({ name: "localdraw-mcp-bridge", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    await client.connect(transport);
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    if (/401|unauthorized/i.test(message)) {
      throw new Error("LocalDraw rejected the MCP key. Generate a new key in Settings → Plugins → Connect AI, then update LOCALDRAW_MCP_TOKEN.");
    }
    throw new Error(`Could not connect to LocalDraw MCP at ${url}: ${message}`);
  }
};

export const runMcpBridge = async ({ launcherEntry, options = {}, env = process.env }) => {
  let upstream;
  let server;
  let closing = false;
  try {
    const config = resolveConfig(options, env);
    await ensureLocalDrawReady({ url: config.url, launcherEntry });
    upstream = await connectUpstream(config);
    server = new Server(
      upstream.getServerVersion() ?? { name: "localdraw", version: "unknown" },
      {
        capabilities: { tools: { listChanged: false } },
        instructions: upstream.getInstructions() ?? "Use LocalDraw tools to inspect and edit the current workspace.",
      },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => upstream.listTools());
    server.setRequestHandler(CallToolRequestSchema, async (request) => upstream.callTool(request.params));
    const close = async () => {
      if (closing) return;
      closing = true;
      await Promise.allSettled([upstream.close(), server.close()]);
    };
    const onSignal = () => void close();
    const onInputEnd = () => void close();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    process.stdin.once("end", onInputEnd);
    upstream.onclose = () => void close();
    const closed = new Promise((resolve) => { server.onclose = resolve; });
    await server.connect(new StdioServerTransport());
    await closed;
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.stdin.off("end", onInputEnd);
    return 0;
  } catch (error) {
    await Promise.allSettled([
      upstream?.close?.() ?? Promise.resolve(),
      server?.close?.() ?? Promise.resolve(),
    ]);
    process.stderr.write(`[localdraw] MCP bridge unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};
