import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createXiaolaiManifest,
  pruneDesktopDependencies,
  pruneDesktopFrontend,
} from "../scripts/prepare-utils.mjs";

test(
  "creates a deterministic checksum manifest for Xiaolai subsets",
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "localdraw-xiaolai-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    writeFileSync(
      join(root, "Xiaolai-Regular-0123456789abcdef0123456789abcdef.woff2"),
      "font-data",
    );

    assert.deepEqual(createXiaolaiManifest(root, "0.18.1"), {
      packageVersion: "0.18.1",
      files: {
        "Xiaolai-Regular-0123456789abcdef0123456789abcdef.woff2": {
          bytes: 9,
          sha256:
            "a9b88942ff0937d83135f1954466ae7e335a1eae4aa00602084a90e598759871",
        },
      },
    });
  },
);

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

test("prunes desktop locales and deprecated fonts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "localdraw-frontend-prune-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relativePath, contents] of [
    ["assets/fr-FR-ABCDE-hash.js", "translation"],
    ["assets/kaa-ABCDE-hash.js", "translation"],
    ["assets/index-ABCDE.js", "application"],
    ["fonts/Assistant/Assistant-Regular.woff2", "font"],
    ["fonts/Virgil/Virgil-Regular.woff2", "font"],
  ]) {
    const path = join(root, relativePath);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }

  assert.deepEqual(pruneDesktopFrontend(root), { localeChunks: 2 });
  assert.equal(existsSync(join(root, "assets/fr-FR-ABCDE-hash.js")), false);
  assert.equal(existsSync(join(root, "assets/kaa-ABCDE-hash.js")), false);
  assert.equal(existsSync(join(root, "assets/index-ABCDE.js")), true);
  assert.equal(existsSync(join(root, "fonts/Assistant")), false);
  assert.equal(existsSync(join(root, "fonts/Virgil/Virgil-Regular.woff2")), true);
});
