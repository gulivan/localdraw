import assert from "node:assert/strict";
import test from "node:test";
import {
  highestReleaseType,
  incrementVersion,
  parseGitLog,
  releaseTypeForCommit,
} from "./next-desktop-version.mjs";

test("maps Conventional Commits to semantic release types", () => {
  assert.equal(releaseTypeForCommit({ subject: "fix: preserve drawings" }), "patch");
  assert.equal(releaseTypeForCommit({ subject: "perf(api): avoid duplicate scans" }), "patch");
  assert.equal(releaseTypeForCommit({ subject: "feat(desktop): use files" }), "minor");
  assert.equal(releaseTypeForCommit({ subject: "feat!: replace storage" }), "major");
  assert.equal(
    releaseTypeForCommit({
      subject: "refactor(storage): simplify writes",
      body: "BREAKING CHANGE: old databases are no longer read",
    }),
    "major",
  );
  assert.equal(releaseTypeForCommit({ subject: "docs: explain releases" }), null);
  assert.equal(releaseTypeForCommit({ subject: "unstructured message" }), null);
});

test("selects the highest release type in a range", () => {
  assert.equal(
    highestReleaseType([
      { subject: "fix: one" },
      { subject: "feat: two" },
      { subject: "perf: three" },
    ]),
    "minor",
  );
  assert.equal(highestReleaseType([{ subject: "docs: only docs" }]), null);
});

test("increments stable semantic versions", () => {
  assert.equal(incrementVersion("0.5.11", "patch"), "0.5.12");
  assert.equal(incrementVersion("0.5.11", "minor"), "0.6.0");
  assert.equal(incrementVersion("0.5.11", "major"), "1.0.0");
  assert.throws(() => incrementVersion("v0.5.11", "patch"), /Invalid current version/);
});

test("parses the record and field separators emitted by git log", () => {
  assert.deepEqual(
    parseGitLog("fix: first\x1fbody one\x1efeat(ui): second\x1f\x1e"),
    [
      { subject: "fix: first", body: "body one" },
      { subject: "feat(ui): second", body: "" },
    ],
  );
});
