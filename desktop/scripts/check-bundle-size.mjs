import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "..");
const frontendDir = resolve(rootDir, "frontend/dist");
const buildDir = resolve(desktopDir, "build");
const artifactsDir = resolve(desktopDir, "artifacts");
const desktopVersion = JSON.parse(
  readFileSync(resolve(desktopDir, "package.json"), "utf8"),
).version;

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

const frontendFiles = walkFiles(frontendDir);
const embedsDesktopVersion = frontendFiles
  .filter((path) => path.endsWith(".js") || path.endsWith(".html"))
  .some((path) => readFileSync(path, "utf8").includes(desktopVersion));

if (!embedsDesktopVersion) {
  throw new Error(`Desktop frontend does not embed version ${desktopVersion}`);
}
console.log(`Embedded desktop version: ${desktopVersion}`);
for (const forbidden of ["build/backend", "build/template.db"]) {
  if (existsSync(resolve(desktopDir, forbidden))) {
    throw new Error(`Removed desktop database artifact returned: ${forbidden}`);
  }
}
const packagedDatabaseFiles = walkFiles(buildDir).filter((path) => {
  const normalized = path.replaceAll("\\", "/");
  return normalized.includes("/Resources/app/backend/") ||
    normalized.endsWith("/Resources/app/template.db") ||
    normalized.endsWith("/Resources/app/excalidash.db");
});
if (packagedDatabaseFiles.length > 0) {
  throw new Error(
    `Removed desktop database payload returned: ${packagedDatabaseFiles.join(", ")}`,
  );
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

assertBudget("Desktop frontend", treeSize(frontendDir), 4_500_000);

if (existsSync(artifactsDir)) {
  for (const entry of readdirSync(artifactsDir)) {
    if (entry.endsWith(".dmg")) {
      const budget = process.arch === "arm64" ? 22_500_000 : 25_500_000;
      assertBudget("macOS DMG", statSync(resolve(artifactsDir, entry)).size, budget);
    }
  }
}
