import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

export const selectQueryEngine = (fileNames, binaryTarget) => {
  const marker = `query_engine-${binaryTarget}.`;
  const matches = fileNames.filter(
    (name) => name.includes(marker) && name.endsWith(".node"),
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected one Prisma query engine for ${binaryTarget}, found ${matches.length}.`,
    );
  }

  return matches[0];
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
