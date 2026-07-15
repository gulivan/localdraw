import { spawnSync } from "node:child_process";
import { basename } from "node:path";

const formatFailureOutput = (result) =>
  [result.stdout, result.stderr]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join("\n");

export const createCommandRunner = ({ verbose = false, spawnSyncImpl = spawnSync } = {}) =>
  (command, args) => {
    const result = spawnSyncImpl(command, args, {
      stdio: verbose ? "inherit" : "pipe",
      encoding: verbose ? undefined : "utf8",
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      const output = formatFailureOutput(result);
      throw new Error(
        `${basename(command)} exited with status ${result.status}${output ? `\n${output}` : ""}`,
      );
    }
  };

export const getLaunchCommand = ({
  platform = process.platform,
  appBundle,
  executable,
  args = [],
  useConfiguredBinary = false,
}) => {
  if (platform === "darwin" && appBundle && !useConfiguredBinary) {
    return {
      command: "open",
      args: [appBundle, ...(args.length > 0 ? ["--args", ...args] : [])],
      detached: false,
    };
  }

  return { command: executable, args, detached: true };
};
