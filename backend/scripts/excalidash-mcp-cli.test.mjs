import assert from "node:assert/strict";
import test from "node:test";
import {
  CliError,
  DEFAULT_MCP_URL,
  assertToolAllowed,
  parseArgs,
  readJsonInput,
  resolveConfig,
} from "./excalidash-mcp-cli.mjs";

test("parseArgs extracts options and command arguments", () => {
  assert.deepEqual(parseArgs(["--url", "http://localhost:6767/api/mcp", "--yes", "call", "list_projects"]).command, "call");
  assert.deepEqual(parseArgs(["--url", "http://localhost:6767/api/mcp", "--yes", "call", "list_projects"]).args, ["list_projects"]);
  assert.equal(parseArgs(["--url", "http://localhost:6767/api/mcp", "--yes", "call", "list_projects"]).options.url, "http://localhost:6767/api/mcp");
  assert.equal(parseArgs(["--url", "http://localhost:6767/api/mcp", "--yes", "call", "list_projects"]).options.yes, true);
});

test("resolveConfig uses defaults and requires a token", () => {
  assert.deepEqual(resolveConfig({}, { EXCALIDASH_MCP_TOKEN: "exd_test" }), {
    url: new URL(DEFAULT_MCP_URL),
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
