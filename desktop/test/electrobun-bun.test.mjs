import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveElectrobunBun } from "../scripts/electrobun-bun.mjs";

test("uses Bun from PATH when a fresh Electrobun install has no runtime", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "localdraw-bun-resolver-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  mkdirSync(join(root, "node_modules/electrobun"), { recursive: true });

  assert.equal(resolveElectrobunBun(root, () => true), "bun");
});
