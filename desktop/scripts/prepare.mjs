import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  cleanDesktopBuildOutputs,
  createXiaolaiManifest,
  pruneDesktopFrontend,
} from "./prepare-utils.mjs";

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "..");
const frontendDir = resolve(rootDir, "frontend");
const buildDir = resolve(desktopDir, "build");
const xiaolaiManifestPath = resolve(buildDir, "xiaolai-manifest.json");
const desktopPackage = JSON.parse(
  readFileSync(resolve(desktopDir, "package.json"), "utf8"),
);
const desktopVersion = desktopPackage.version;

if (typeof desktopVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(desktopVersion)) {
  throw new Error("desktop/package.json contains an invalid version");
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

mkdirSync(buildDir, { recursive: true });
cleanDesktopBuildOutputs(buildDir);
rmSync(resolve(buildDir, "backend"), { recursive: true, force: true });
rmSync(resolve(buildDir, "template.db"), { force: true });
run("npm", ["run", "build"], {
  cwd: frontendDir,
  env: {
    ...process.env,
    VITE_API_URL: "/api",
    VITE_APP_BUILD_LABEL: "Electrobun desktop",
    VITE_APP_VERSION: desktopVersion,
    VITE_DESKTOP_MINIMAL: "true",
  },
});
const prunedFrontend = pruneDesktopFrontend(resolve(frontendDir, "dist"));
console.log(`Pruned ${prunedFrontend.localeChunks} desktop locale chunks.`);

const excalidrawPackage = JSON.parse(
  readFileSync(
    resolve(
      frontendDir,
      "node_modules/@excalidraw/excalidraw/package.json",
    ),
    "utf8",
  ),
);
const xiaolaiDir = resolve(frontendDir, "dist/fonts/Xiaolai");
const xiaolaiManifest = createXiaolaiManifest(
  xiaolaiDir,
  excalidrawPackage.version,
);
writeFileSync(xiaolaiManifestPath, JSON.stringify(xiaolaiManifest));
rmSync(xiaolaiDir, { recursive: true, force: true });
