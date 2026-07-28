import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION, RELEASE_VERSION, getInstallLayout, getTarget } from "../lib/platform.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("derives the native release from the npm package version", () => {
  assert.equal(APP_VERSION, packageJson.version);
  assert.equal(RELEASE_VERSION, `${APP_VERSION}-desktop`);
});

test("maps supported platforms to release assets", () => {
  assert.equal(getTarget("darwin", "arm64").archive, `localdraw-${APP_VERSION}-darwin-arm64.dmg`);
  assert.equal(getTarget("darwin", "x64").archive, `localdraw-${APP_VERSION}-darwin-x64.dmg`);
  assert.equal(getTarget("linux", "x64").archive, `localdraw-${APP_VERSION}-linux-x64.tar.gz`);
  assert.equal(
    getTarget("win32", "arm64").archive,
    `localdraw-${APP_VERSION}-win-x64-portable.exe`,
  );
});

test("rejects architectures without a published native build", () => {
  assert.throws(() => getTarget("linux", "arm64"), /No LocalDraw build/);
});

test("uses user-writable install locations", () => {
  assert.equal(
    getInstallLayout("darwin", "/home/me").installDir,
    "/home/me/Applications/LocalDraw.app",
  );
  assert.match(getInstallLayout("linux", "/home/me").installDir, /\.local/);
  assert.match(
    getInstallLayout("win32", "C:\\Users\\me", "C:\\LocalAppData").installDir,
    /LocalDraw/,
  );
});

test("uses executable paths from flattened Electrobun bundles", () => {
  assert.deepEqual(getInstallLayout("linux", "/home/me").executables, [
    "/home/me/.local/share/localdraw/app/bin/launcher",
  ]);
  assert.deepEqual(
    getInstallLayout("win32", "C:\\Users\\me", "C:\\LocalAppData").executables,
    ["C:\\LocalAppData/LocalDraw/localdraw-portable.exe"],
  );
});
