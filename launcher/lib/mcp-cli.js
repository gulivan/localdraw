import fs from "node:fs/promises";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const DEFAULT_MCP_URL = "http://127.0.0.1:32144/api/mcp";

export const MCP_COMMANDS = new Set([
  "help",
  "list-tools",
  "call",
  "list-projects",
  "list-canvases",
  "get-canvas",
  "describe-canvas",
]);

export const DESTRUCTIVE_TOOLS = new Set([
  "apply_canvas_patch",
  "delete_project",
  "move_canvas_to_trash",
  "permanently_delete_canvas",
  "restore_canvas_snapshot",
  "trim_canvas_storage",
  "delete_canvas_orphan_files",
]);

const HELP = `LocalDraw MCP CLI

Usage:
  localdraw -- [options] <command> [args]

Options:
  --url <url>       MCP endpoint. Defaults to LOCALDRAW_MCP_URL, EXCALIDASH_MCP_URL, or ${DEFAULT_MCP_URL}
  --token <token>   MCP bearer token. Defaults to LOCALDRAW_MCP_TOKEN or EXCALIDASH_MCP_TOKEN
  --out <file>      Write the first image result to a file
  --yes             Allow destructive tool calls
  -h, --help        Show this help

Commands:
  help
  list-tools
  call <tool> [json|@file|-]
  list-projects
  list-canvases [json|@file|-]
  get-canvas <canvasId>
  describe-canvas <canvasId>

Examples:
  LOCALDRAW_MCP_TOKEN=exd_... npx localdraw -- list-tools
  npx localdraw -- call list_projects
  npx localdraw -- list-canvases '{"projectId":null}'
  npx localdraw -- describe-canvas canvas_123
`;

export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export const extractMcpArgs = (argv) => {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex !== -1) return argv.slice(separatorIndex + 1);
  return MCP_COMMANDS.has(argv[0]) ? argv : null;
};

export const parseMcpArgs = (argv) => {
  const options = { yes: false };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--url" || arg === "--token" || arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError(`${arg} requires a value`);
      }
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new CliError(`Unknown MCP option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  return {
    command: options.help ? "help" : positionals[0] ?? "help",
    args: positionals.slice(1),
    options,
  };
};

export const resolveConfig = (options, env = process.env) => {
  const url = options.url || env.LOCALDRAW_MCP_URL || env.EXCALIDASH_MCP_URL || DEFAULT_MCP_URL;
  const token = options.token || env.LOCALDRAW_MCP_TOKEN || env.EXCALIDASH_MCP_TOKEN;
  if (!token) {
    throw new CliError("Missing MCP bearer token. Set LOCALDRAW_MCP_TOKEN or pass --token.");
  }
  try {
    return { url: new URL(url), token };
  } catch {
    throw new CliError(`Invalid MCP URL: ${url}`);
  }
};

export const assertToolAllowed = (toolName, options) => {
  if (DESTRUCTIVE_TOOLS.has(toolName) && !options.yes) {
    throw new CliError(`Refusing to call destructive tool "${toolName}" without --yes.`);
  }
};

const readStdin = async () => {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
};

export const readJsonInput = async (raw) => {
  if (!raw) return {};
  const text = raw === "-"
    ? await readStdin()
    : raw.startsWith("@")
      ? await fs.readFile(raw.slice(1), "utf8")
      : raw;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`Invalid JSON input: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const connect = async (config) => {
  const client = new Client({ name: "localdraw-mcp-cli", version: "0.1.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(config.url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    },
  });
  await client.connect(transport);
  return client;
};

const writeJson = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const writeToolResult = async (result, outFile) => {
  if (outFile) {
    const image = result.content?.find((item) => item?.type === "image" && typeof item.data === "string");
    if (!image) throw new CliError("Tool result did not include an image to write.");
    await fs.writeFile(outFile, Buffer.from(image.data, "base64"));
    writeJson({ wroteImage: outFile, mimeType: image.mimeType ?? null, structuredContent: result.structuredContent ?? null });
    return;
  }
  writeJson(result.structuredContent ?? result);
};

const callTool = async (client, toolName, args, options) => {
  assertToolAllowed(toolName, options);
  const result = await client.callTool({ name: toolName, arguments: args });
  await writeToolResult(result, options.out);
};

export const executeMcpCommand = async ({ command, args, options }) => {
  if (command === "help") {
    process.stdout.write(HELP);
    return;
  }

  const config = resolveConfig(options);
  const client = await connect(config);
  try {
    if (command === "list-tools") {
      const result = await client.listTools();
      writeJson({
        server: client.getServerVersion() ?? null,
        instructions: client.getInstructions() ?? null,
        tools: result.tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
      return;
    }

    if (command === "call") {
      const [toolName, rawJson] = args;
      if (!toolName) throw new CliError("call requires a tool name");
      await callTool(client, toolName, await readJsonInput(rawJson), options);
      return;
    }

    if (command === "list-projects") {
      await callTool(client, "list_projects", {}, options);
      return;
    }

    if (command === "list-canvases") {
      await callTool(client, "list_canvases", await readJsonInput(args[0]), options);
      return;
    }

    if (command === "get-canvas" || command === "describe-canvas") {
      const canvasId = args[0];
      if (!canvasId) throw new CliError(`${command} requires a canvas id`);
      await callTool(client, command === "get-canvas" ? "get_canvas" : "describe_canvas", { canvasId }, options);
      return;
    }

    throw new CliError(`Unknown MCP command: ${command}`);
  } finally {
    await client.close();
  }
};

export const runMcpCli = async (argv) => {
  try {
    await executeMcpCommand(parseMcpArgs(argv));
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return error instanceof CliError ? error.exitCode : 1;
  }
};
