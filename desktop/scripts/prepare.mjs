import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const desktopDir = resolve(import.meta.dirname, "..");
const rootDir = resolve(desktopDir, "..");
const backendDir = resolve(rootDir, "backend");
const frontendDir = resolve(rootDir, "frontend");
const buildDir = resolve(desktopDir, "build");
const stagedBackendDir = resolve(buildDir, "backend");
const generatedClientDir = resolve(backendDir, "src/generated/client");
const stagedGeneratedClientDir = resolve(stagedBackendDir, "dist/generated/client");
const templateDb = resolve(buildDir, "template.db");

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
  },
});

rmSync(templateDb, { force: true });
run("npx", ["prisma", "db", "push", "--skip-generate"], {
  cwd: backendDir,
  env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
});

rmSync(stagedBackendDir, { recursive: true, force: true });
mkdirSync(stagedBackendDir, { recursive: true });
cpSync(resolve(backendDir, "dist"), resolve(stagedBackendDir, "dist"), {
  recursive: true,
});
const queryEngines = readdirSync(generatedClientDir).filter(
  (name) => name.includes("query_engine") && name.endsWith(".node"),
);
if (queryEngines.length === 0) {
  throw new Error("Prisma generated no native query engine for the desktop package.");
}
mkdirSync(stagedGeneratedClientDir, { recursive: true });
for (const queryEngine of queryEngines) {
  cpSync(
    resolve(generatedClientDir, queryEngine),
    resolve(stagedGeneratedClientDir, queryEngine),
  );
}
cpSync(resolve(backendDir, "package.json"), resolve(stagedBackendDir, "package.json"));
cpSync(
  resolve(backendDir, "package-lock.json"),
  resolve(stagedBackendDir, "package-lock.json"),
);
run("npm", ["ci", "--omit=dev"], { cwd: stagedBackendDir });
