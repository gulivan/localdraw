import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { downloadFile } from "../lib/download.js";

test("retries transient download failures and writes the successful response", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "localdraw-download-test-"));
  const destination = join(directory, "asset.txt");
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  let calls = 0;

  await downloadFile("https://example.test/asset", destination, {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed", { cause: new Error("connection reset") });
      return new Response("downloaded");
    },
    waitImpl: async () => {},
  });

  assert.equal(calls, 2);
  assert.equal(readFileSync(destination, "utf8"), "downloaded");
});

test("reports the URL and underlying cause after bounded retries", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "localdraw-download-test-"));
  const destination = join(directory, "asset.txt");
  t.after(() => rmSync(directory, { force: true, recursive: true }));

  await assert.rejects(
    downloadFile("https://example.test/missing", destination, {
      attempts: 2,
      fetchImpl: async () => { throw new TypeError("fetch failed", { cause: new Error("TLS unavailable") }); },
      waitImpl: async () => {},
    }),
    /Download failed after 2 attempts.*example\.test\/missing.*fetch failed: TLS unavailable/,
  );
});
