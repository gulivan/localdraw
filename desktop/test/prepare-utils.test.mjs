import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  pruneDesktopDependencies,
  selectQueryEngine,
} from "../scripts/prepare-utils.mjs";

test("selects only the query engine matching the host binary target", () => {
  const files = [
    "libquery_engine-darwin-arm64.dylib.node",
    "libquery_engine-linux-musl-openssl-3.0.x.so.node",
    "query_engine-windows.dll.node",
  ];

  assert.equal(
    selectQueryEngine(files, "linux-musl-openssl-3.0.x"),
    "libquery_engine-linux-musl-openssl-3.0.x.so.node",
  );
  assert.equal(
    selectQueryEngine(files, "windows"),
    "query_engine-windows.dll.node",
  );
});

test("rejects missing and ambiguous query engines", () => {
  assert.throws(() => selectQueryEngine([], "darwin-arm64"), /found 0/);
  assert.throws(
    () =>
      selectQueryEngine(
        [
          "libquery_engine-darwin-arm64.dylib.node",
          "query_engine-darwin-arm64.dylib.node",
        ],
        "darwin-arm64",
      ),
    /found 2/,
  );
});

test("prunes desktop build material while retaining runtime and license files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "localdraw-prune-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const relativePath of [
    "node_modules/prisma",
    "node_modules/@prisma/engines",
    "node_modules/@prisma/fetch-engine",
    "node_modules/@prisma/get-platform",
    "node_modules/.cache/prisma/windows",
    "node_modules/@types/node",
    "node_modules/better-sqlite3/deps/sqlite3",
    "node_modules/zod/src",
    "node_modules/@aws-sdk/client-s3/dist-types",
  ]) {
    const directory = join(root, relativePath);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), "{}");
  }
  for (const [relativePath, contents] of [
    ["node_modules/example/index.js", "module.exports = true"],
    ["node_modules/example/index.js.map", "{}"],
    ["node_modules/example/index.d.ts", "export {}"],
    ["node_modules/example/README.md", "documentation"],
    ["node_modules/example/LICENSE.md", "license"],
    ["node_modules/example/package.json", "{}"],
  ]) {
    const path = join(root, relativePath);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }
  for (const fileName of ["prisma", "prisma.cmd", "prisma.ps1"]) {
    const path = join(root, "node_modules/.bin", fileName);
    mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
    writeFileSync(path, "shim");
  }

  pruneDesktopDependencies(root);

  assert.equal(existsSync(join(root, "node_modules/prisma")), false);
  assert.equal(existsSync(join(root, "node_modules/@prisma/engines")), false);
  assert.equal(existsSync(join(root, "node_modules/@prisma/fetch-engine")), false);
  assert.equal(existsSync(join(root, "node_modules/@prisma/get-platform")), true);
  assert.equal(existsSync(join(root, "node_modules/.bin/prisma")), false);
  assert.equal(existsSync(join(root, "node_modules/.bin/prisma.cmd")), false);
  assert.equal(existsSync(join(root, "node_modules/.bin/prisma.ps1")), false);
  assert.equal(existsSync(join(root, "node_modules/.cache")), false);
  assert.equal(existsSync(join(root, "node_modules/@types")), false);
  assert.equal(existsSync(join(root, "node_modules/better-sqlite3/deps")), false);
  assert.equal(existsSync(join(root, "node_modules/zod/src")), false);
  assert.equal(
    existsSync(join(root, "node_modules/@aws-sdk/client-s3/dist-types")),
    false,
  );
  assert.equal(existsSync(join(root, "node_modules/example/index.js")), true);
  assert.equal(existsSync(join(root, "node_modules/example/index.js.map")), false);
  assert.equal(existsSync(join(root, "node_modules/example/index.d.ts")), false);
  assert.equal(existsSync(join(root, "node_modules/example/README.md")), false);
  assert.equal(existsSync(join(root, "node_modules/example/LICENSE.md")), true);
  assert.equal(existsSync(join(root, "node_modules/example/package.json")), true);
});
