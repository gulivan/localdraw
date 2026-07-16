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

export const pruneDesktopDependencies = (stagedBackendDir) => {
  const relativePaths = [
    "node_modules/.cache",
    "node_modules/.bin/prisma",
    "node_modules/.bin/prisma.cmd",
    "node_modules/.bin/prisma.ps1",
    "node_modules/prisma",
    "node_modules/@prisma/engines",
    "node_modules/@prisma/fetch-engine",
    "node_modules/@types",
    "node_modules/better-sqlite3/deps",
    "node_modules/better-sqlite3/src",
    "node_modules/better-sqlite3/binding.gyp",
    "node_modules/zod/src",
  ];

  for (const relativePath of relativePaths) {
    const path = resolve(stagedBackendDir, relativePath);
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }

  const nodeModulesDir = resolve(stagedBackendDir, "node_modules");
  if (!existsSync(nodeModulesDir)) return;

  const removableFile = (name) => {
    const lowerName = name.toLowerCase();
    if (/^(license|licence|copying|notice)(\.|$)/.test(lowerName)) {
      return false;
    }
    return (
      lowerName.endsWith(".map") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".markdown") ||
      lowerName.endsWith(".d.ts") ||
      lowerName.endsWith(".d.cts") ||
      lowerName.endsWith(".d.mts") ||
      lowerName.endsWith(".tsbuildinfo")
    );
  };

  const pruneTree = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "dist-types") {
          rmSync(path, { recursive: true, force: true });
        } else {
          pruneTree(path);
        }
      } else if (entry.isFile() && removableFile(entry.name)) {
        rmSync(path, { force: true });
      }
    }
  };

  pruneTree(nodeModulesDir);
};
