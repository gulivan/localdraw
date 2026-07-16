import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { resolveElectrobunBun } from "./electrobun-bun.mjs";

const desktopDir = resolve(import.meta.dirname, "..");
const bunExecutable = resolveElectrobunBun(desktopDir);
const result = spawnSync(bunExecutable, process.argv.slice(2), {
  cwd: desktopDir,
  stdio: "inherit",
  shell: false,
});
process.exit(result.status ?? 1);
