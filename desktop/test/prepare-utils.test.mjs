import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  cleanDesktopBuildOutputs,
  createXiaolaiManifest,
  pruneDesktopFrontend,
} from "../scripts/prepare-utils.mjs";

test("removes stale Electrobun app bundles before packaging", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "localdraw-build-clean-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const entry of ["dev-macos-arm64", "stable-win-x64", "canary-linux-x64"]) {
    mkdirSync(join(root, entry), { recursive: true });
  }
  mkdirSync(join(root, "cache"), { recursive: true });

  assert.deepEqual(cleanDesktopBuildOutputs(root).sort(), [
    "canary-linux-x64",
    "dev-macos-arm64",
    "stable-win-x64",
  ]);
  assert.equal(existsSync(join(root, "cache")), true);
});

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
