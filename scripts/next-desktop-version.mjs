#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CONVENTIONAL_SUBJECT = /^([a-z][a-z0-9-]*)(?:\([^)]+\))?(!)?:\s+.+$/;
const BREAKING_FOOTER = /^BREAKING(?: CHANGE|-CHANGE):\s*.+$/m;

export function releaseTypeForCommit({ subject, body = "" }) {
  const match = subject.match(CONVENTIONAL_SUBJECT);
  if (!match) return null;
  if (match[2] === "!" || BREAKING_FOOTER.test(body)) return "major";
  if (match[1] === "feat") return "minor";
  if (match[1] === "fix" || match[1] === "perf") return "patch";
  return null;
}

export function highestReleaseType(commits) {
  const weight = { patch: 1, minor: 2, major: 3 };
  return commits.reduce((highest, commit) => {
    const candidate = releaseTypeForCommit(commit);
    return (weight[candidate] ?? 0) > (weight[highest] ?? 0) ? candidate : highest;
  }, null);
}

export function incrementVersion(currentVersion, releaseType) {
  const match = currentVersion.match(SEMVER);
  if (!match) throw new Error(`Invalid current version: ${currentVersion}`);
  const [, majorText, minorText, patchText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  if (releaseType === "major") return `${major + 1}.0.0`;
  if (releaseType === "minor") return `${major}.${minor + 1}.0`;
  if (releaseType === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Invalid release type: ${releaseType}`);
}

export function parseGitLog(log) {
  return log
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [subject = "", body = ""] = record.split("\x1f");
      return { subject: subject.trim(), body: body.trim() };
    });
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function writeOutputs(values, outputPath) {
  const text = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  if (outputPath) appendFileSync(outputPath, `${text}\n`);
  process.stdout.write(`${text}\n`);
}

function main() {
  const currentVersion = argument("--current");
  const range = argument("--range");
  const outputPath = argument("--github-output");
  if (!currentVersion || !range) {
    throw new Error(
      "Usage: next-desktop-version.mjs --current <version> --range <git-range> [--github-output <path>]",
    );
  }

  const result = spawnSync(
    "git",
    ["log", "--format=%s%x1f%b%x1e", range],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git log failed for ${range}`);
  }

  const releaseType = highestReleaseType(parseGitLog(result.stdout));
  if (!releaseType) {
    writeOutputs({ release: false }, outputPath);
    return;
  }
  const version = incrementVersion(currentVersion, releaseType);
  writeOutputs(
    {
      release: true,
      type: releaseType,
      version,
      tag: `v${version}-desktop`,
    },
    outputPath,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
