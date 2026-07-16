import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createXiaolaiManifest,
  pruneDesktopDependencies,
  pruneDesktopFrontend,
} from "./prepare-utils.mjs";
import { resolveElectrobunBun } from "./electrobun-bun.mjs";

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "..");
const backendDir = resolve(rootDir, "backend");
const frontendDir = resolve(rootDir, "frontend");
const buildDir = resolve(desktopDir, "build");
const stagedBackendDir = resolve(buildDir, "backend");
const stagedBackendDistDir = resolve(stagedBackendDir, "dist");
const generatedClientDir = resolve(backendDir, "src/generated/client");
const stagedGeneratedClientDir = resolve(stagedBackendDistDir, "generated/client");
const templateDb = resolve(buildDir, "template.db");
const xiaolaiManifestPath = resolve(buildDir, "xiaolai-manifest.json");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

mkdirSync(buildDir, { recursive: true });
run("npm", ["run", "build"], { cwd: backendDir });
run("npm", ["run", "build"], {
  cwd: frontendDir,
  env: {
    ...process.env,
    VITE_API_URL: "http://127.0.0.1:32145",
    VITE_APP_BUILD_LABEL: "Electrobun desktop",
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

rmSync(templateDb, { force: true });
run("npx", ["prisma", "db", "push", "--skip-generate"], {
  cwd: backendDir,
  env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
});

rmSync(stagedBackendDir, { recursive: true, force: true });
mkdirSync(stagedBackendDistDir, { recursive: true });

const bunExecutable = resolveElectrobunBun(desktopDir);
run(
  bunExecutable,
  [
    resolve(desktopDir, "scripts/bundle-backend.mjs"),
    resolve(backendDir, "dist/index.js"),
    resolve(stagedBackendDistDir, "index.js"),
  ],
  { cwd: backendDir, shell: false },
);

mkdirSync(resolve(stagedGeneratedClientDir, "runtime"), { recursive: true });
for (const relativePath of [
  "index.js",
  "query_compiler_bg.js",
  "query_compiler_bg.wasm",
  "runtime/client.js",
  "schema.prisma",
]) {
  cpSync(
    resolve(generatedClientDir, relativePath),
    resolve(stagedGeneratedClientDir, relativePath),
  );
}

const generatedClientProxyDir = resolve(stagedBackendDir, "generated/client");
mkdirSync(generatedClientProxyDir, { recursive: true });
writeFileSync(
  resolve(generatedClientProxyDir, "index.js"),
  'module.exports = require("../../dist/generated/client");\n',
);

const workerDir = resolve(stagedBackendDistDir, "workers");
mkdirSync(workerDir, { recursive: true });
cpSync(
  resolve(backendDir, "dist/workers/db-verify.js"),
  resolve(workerDir, "db-verify.js"),
);

cpSync(
  resolve(backendDir, "package.json"),
  resolve(stagedBackendDir, "package.json"),
);
pruneDesktopDependencies(stagedBackendDir);
