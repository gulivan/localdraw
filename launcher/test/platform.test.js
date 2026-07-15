import test from "node:test";
import assert from "node:assert/strict";
import { getInstallLayout, getTarget } from "../lib/platform.js";

test("maps supported platforms to release assets", () => {
  assert.equal(getTarget("darwin", "arm64").archive, "localdraw-0.5.3-darwin-arm64.dmg");
  assert.equal(getTarget("darwin", "x64").archive, "localdraw-0.5.3-darwin-x64.dmg");
  assert.equal(getTarget("linux", "x64").archive, "localdraw-0.5.3-linux-x64.tar.gz");
  assert.equal(getTarget("win32", "arm64").archive, "localdraw-0.5.3-win-x64.zip");
});

test("rejects architectures without a published native build", () => {
  assert.throws(() => getTarget("linux", "arm64"), /No LocalDraw build/);
});

test("uses user-writable install locations", () => {
  assert.match(getInstallLayout("darwin", "/home/me").installDir, /Applications/);
  assert.match(getInstallLayout("linux", "/home/me").installDir, /\.local/);
  assert.match(
    getInstallLayout("win32", "C:\\Users\\me", "C:\\LocalAppData").installDir,
    /LocalDraw/,
  );
});
