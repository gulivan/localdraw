import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  LOCALDRAW_URL,
  formatHelp,
  parseCliArgs,
} from "../lib/cli.js";

test("parses launcher help, version, and browser options", () => {
  assert.deepEqual(parseCliArgs(["--browser", "-h", "--version"]), {
    browser: true,
    help: true,
    version: true,
  });
});

test("documents browser mode and its local address", () => {
  assert.match(formatHelp(), /--browser/);
  assert.match(formatHelp(), new RegExp(LOCALDRAW_URL.replaceAll(".", "\\.")));
});

test("prints help without installing or launching the app", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "../bin/excalidash.js"), "--help"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Usage: localdraw/);
  assert.doesNotMatch(result.stdout, /Downloading|Launching/);
});
