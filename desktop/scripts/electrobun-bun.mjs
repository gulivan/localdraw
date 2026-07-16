import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const resolveElectrobunBun = (
  desktopDir,
  pathProbe = () =>
    spawnSync("bun", ["--version"], {
      stdio: "ignore",
      shell: false,
    }).status === 0,
) => {
  const configured = process.env.BUN_EXECUTABLE;
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`BUN_EXECUTABLE does not exist: ${configured}`);
    }
    return configured;
  }

  const electrobunDir = resolve(desktopDir, "node_modules/electrobun");
  const executable = process.platform === "win32" ? "bun.exe" : "bun";
  const runtimeDir = readdirSync(electrobunDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("dist-"))
    .map((entry) => resolve(electrobunDir, entry.name))
    .find((directory) => existsSync(resolve(directory, executable)));
  if (runtimeDir) return resolve(runtimeDir, executable);

  if (pathProbe()) return "bun";

  throw new Error(
    "Could not find Bun in Electrobun or PATH. Install Bun or set BUN_EXECUTABLE.",
  );
};
