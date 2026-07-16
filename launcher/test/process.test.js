import test from "node:test";
import assert from "node:assert/strict";
import { createCommandRunner, getLaunchCommand } from "../lib/process.js";

test("captures successful command output in quiet mode", () => {
  let options;
  const run = createCommandRunner({
    spawnSyncImpl: (_command, _args, receivedOptions) => {
      options = receivedOptions;
      return { status: 0, stdout: "hidden", stderr: "" };
    },
  });

  run("hdiutil", ["attach"]);
  assert.deepEqual(options, { stdio: "pipe", encoding: "utf8" });
});

test("inherits command output in verbose mode", () => {
  let options;
  const run = createCommandRunner({
    verbose: true,
    spawnSyncImpl: (_command, _args, receivedOptions) => {
      options = receivedOptions;
      return { status: 0 };
    },
  });

  run("hdiutil", ["attach"]);
  assert.deepEqual(options, { stdio: "inherit", encoding: undefined });
});

test("includes captured output when a quiet command fails", () => {
  const run = createCommandRunner({
    spawnSyncImpl: () => ({ status: 1, stdout: "details", stderr: "failure" }),
  });

  assert.throws(() => run("hdiutil", ["attach"]), /details\nfailure/);
});

test("launches the macOS bundle through LaunchServices", () => {
  assert.deepEqual(
    getLaunchCommand({
      platform: "darwin",
      appBundle: "/Users/me/Applications/LocalDraw.app",
      executable: "/internal/launcher",
      args: ["--example"],
    }),
    {
      command: "open",
      args: ["/Users/me/Applications/LocalDraw.app", "--args", "--example"],
      detached: false,
    },
  );
});

test("keeps configured binaries and non-macOS launches direct", () => {
  assert.equal(
    getLaunchCommand({
      platform: "darwin",
      appBundle: "/Applications/LocalDraw.app",
      executable: "/tmp/test-binary",
      useConfiguredBinary: true,
    }).command,
    "/tmp/test-binary",
  );
  assert.equal(
    getLaunchCommand({ platform: "linux", executable: "/app/launcher" }).command,
    "/app/launcher",
  );
});
