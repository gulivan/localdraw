import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

export const createXiaolaiManifest = (directory, packageVersion) => {
  const files = {};
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    if (
      !entry.isFile() ||
      !/^Xiaolai-Regular-[a-f\d]{32}\.woff2$/.test(entry.name)
    ) {
      throw new Error(`Unexpected Xiaolai asset: ${entry.name}`);
    }
    const contents = readFileSync(resolve(directory, entry.name));
    files[entry.name] = {
      bytes: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
  }
  if (Object.keys(files).length === 0) {
    throw new Error("No Xiaolai font subsets were found.");
  }
  return { packageVersion, files };
};

const desktopLocaleChunk =
  /^[a-z]{2,3}(?:-[A-Z]{2})?-[A-Z0-9]+-[A-Za-z0-9_-]+\.js$/;

export const pruneDesktopFrontend = (frontendDistDir) => {
  const assetsDir = resolve(frontendDistDir, "assets");
  let localeChunks = 0;
  if (existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
      if (entry.isFile() && desktopLocaleChunk.test(entry.name)) {
        rmSync(resolve(assetsDir, entry.name), { force: true });
        localeChunks += 1;
      }
    }
  }

  for (const family of ["Assistant", "ComicShanns", "Lilita", "Nunito"]) {
    rmSync(resolve(frontendDistDir, "fonts", family), {
      recursive: true,
      force: true,
    });
  }

  if (localeChunks === 0) {
    throw new Error("No desktop locale chunks were found to prune");
  }
  return { localeChunks };
};

export const cleanDesktopBuildOutputs = (buildDir) => {
  if (!existsSync(buildDir)) return [];
  const removed = [];
  for (const entry of readdirSync(buildDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^(?:dev|stable|canary)-/.test(entry.name)) {
      continue;
    }
    rmSync(resolve(buildDir, entry.name), { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
};
