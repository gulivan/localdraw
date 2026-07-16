import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const desktopDir = resolve(import.meta.dirname, "..");
const electrobunDir = resolve(desktopDir, "node_modules/electrobun");
const executable = process.platform === "win32" ? "bun.exe" : "bun";
const runtimeDir = readdirSync(electrobunDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("dist-"))
  .map((entry) => resolve(electrobunDir, entry.name))
  .find((directory) => existsSync(resolve(directory, executable)));

if (!runtimeDir) throw new Error("Could not find Electrobun's host Bun runtime");
const result = spawnSync(resolve(runtimeDir, executable), process.argv.slice(2), {
  cwd: desktopDir,
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
