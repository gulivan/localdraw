import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "..");
const backendDir = resolve(desktopDir, "build/backend");
const frontendDir = resolve(rootDir, "frontend/dist");
const artifactsDir = resolve(desktopDir, "artifacts");

const treeSize = (directory) =>
  readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const path = resolve(directory, entry.name);
    return total + (entry.isDirectory() ? treeSize(path) : statSync(path).size);
  }, 0);

const walkFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });

const assertBudget = (label, bytes, maximum) => {
  if (bytes > maximum) {
    throw new Error(`${label} is ${bytes} bytes; budget is ${maximum} bytes`);
  }
  console.log(`${label}: ${bytes} / ${maximum} bytes`);
};

const backendFiles = walkFiles(backendDir);
const frontendFiles = walkFiles(frontendDir);
const forbiddenBackend = backendFiles.filter(
  (path) => path.endsWith(".node") || path.includes("/node_modules/@libsql/"),
);
if (forbiddenBackend.length > 0) {
  throw new Error(`Native desktop database payload returned: ${forbiddenBackend.join(", ")}`);
}

const assetNames = frontendFiles
  .map((path) => path.replaceAll("\\", "/"))
  .filter((path) => path.includes("/assets/"))
  .map((path) => path.split("/").at(-1));
const localeChunk =
  /^[a-z]{2,3}(?:-[A-Z]{2})?-[A-Z0-9]+-[A-Za-z0-9_-]+\.js$/;
if (assetNames.some((name) => localeChunk.test(name))) {
  throw new Error("Non-English Excalidraw locale chunks remain in the desktop build");
}
if (assetNames.some((name) => /^(Admin|AuthSetup|Login|PasswordReset|Profile|Register)-/.test(name))) {
  throw new Error("Server-only frontend routes remain in the desktop build");
}
for (const requiredChunk of ["Dashboard-", "Editor-", "Settings-"]) {
  if (!assetNames.some((name) => name.startsWith(requiredChunk))) {
    throw new Error(`Required desktop chunk is missing: ${requiredChunk}`);
  }
}

assertBudget("Staged backend", treeSize(backendDir), 6_000_000);
assertBudget("Desktop frontend", treeSize(frontendDir), 4_500_000);

if (existsSync(artifactsDir)) {
  for (const entry of readdirSync(artifactsDir)) {
    if (entry.endsWith(".dmg")) {
      const budget = process.arch === "arm64" ? 22_000_000 : 25_000_000;
      assertBudget("macOS DMG", statSync(resolve(artifactsDir, entry)).size, budget);
    }
  }
}
