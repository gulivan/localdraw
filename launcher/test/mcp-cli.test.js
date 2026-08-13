import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  CliError,
  DEFAULT_MCP_URL,
  assertToolAllowed,
  extractMcpArgs,
  parseMcpArgs,
  readJsonInput,
  resolveConfig,
} from "../lib/mcp-cli.js";

test("extractMcpArgs supports separator and direct npx passthrough forms", () => {
  assert.deepEqual(extractMcpArgs(["--", "list-tools"]), ["list-tools"]);
  assert.deepEqual(extractMcpArgs(["list-tools"]), ["list-tools"]);
  assert.deepEqual(extractMcpArgs(["mcp-bridge"]), ["mcp-bridge"]);
  assert.equal(extractMcpArgs(["--browser"]), null);
});

test("parseMcpArgs extracts options and command arguments", () => {
  const parsed = parseMcpArgs(["--url", "http://localhost:6767/api/mcp", "--yes", "call", "list_projects"]);

  assert.equal(parsed.command, "call");
  assert.deepEqual(parsed.args, ["list_projects"]);
  assert.equal(parsed.options.url, "http://localhost:6767/api/mcp");
  assert.equal(parsed.options.yes, true);
});

test("resolveConfig uses defaults and requires a token", () => {
  assert.deepEqual(resolveConfig({}, { LOCALDRAW_MCP_TOKEN: "exd_test" }), {
    url: new URL(DEFAULT_MCP_URL),
    token: "exd_test",
  });
  assert.deepEqual(resolveConfig({}, { LOCALDRAW_MCP_TOKEN: "exd_test", LOCALDRAW_MCP_URL: "http://localhost:6767/api/mcp" }), {
    url: new URL("http://localhost:6767/api/mcp"),
    token: "exd_test",
  });
  assert.throws(() => resolveConfig({}, {}), CliError);
});

test("assertToolAllowed requires --yes for destructive tools", () => {
  assert.doesNotThrow(() => assertToolAllowed("list_projects", {}));
  assert.throws(() => assertToolAllowed("apply_canvas_patch", {}), /without --yes/);
  assert.doesNotThrow(() => assertToolAllowed("apply_canvas_patch", { yes: true }));
});

test("readJsonInput parses inline JSON and defaults to an empty object", async () => {
  assert.deepEqual(await readJsonInput(undefined), {});
  assert.deepEqual(await readJsonInput('{"projectId":null}'), { projectId: null });
  await assert.rejects(() => readJsonInput("{nope"), /Invalid JSON input/);
});

test("prints MCP help without installing or launching the app", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "../bin/localdraw.js"), "--", "--help"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^LocalDraw MCP CLI/);
  assert.match(result.stdout, /npx localdraw -- list-tools/);
  assert.match(result.stdout, /mcp-bridge/);
  assert.doesNotMatch(result.stdout, /Downloading|Launching/);
});

test("bridge reports a missing key without installing or launching the app", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "../bin/localdraw.js"), "--", "mcp-bridge"],
    { encoding: "utf8", env: { ...process.env, LOCALDRAW_MCP_TOKEN: "" } },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /MCP bridge unavailable: Missing MCP bearer token/);
  assert.doesNotMatch(result.stdout, /Downloading|Launching/);
});
