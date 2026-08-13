#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_VERSION,
  getInstallLayout,
  getTarget,
} from "../lib/platform.js";
import {
  LOCALDRAW_URL,
  formatHelp,
  parseCliArgs,
} from "../lib/cli.js";
import { extractMcpArgs, runMcpCli } from "../lib/mcp-cli.js";
import { runMcpBridge } from "../lib/mcp-bridge.js";
import {
  probeLocalDrawInstance,
  requestLocalDrawShutdown,
  waitForPortRelease,
} from "../lib/instance.js";
import { createCommandRunner, getLaunchCommand } from "../lib/process.js";
import { downloadFile } from "../lib/download.js";

const RELEASE_BASE_URL = `https://github.com/gulivan/localdraw/releases/download/v${RELEASE_VERSION}`;
const verbose = process.env.LOCALDRAW_VERBOSE === "1";
const run = createCommandRunner({ verbose });
const args = process.argv.slice(2);
const mcpArgs = extractMcpArgs(args);
if (mcpArgs) {
  if (mcpArgs[0] === "mcp-bridge") {
    process.exit(await runMcpBridge({ launcherEntry: fileURLToPath(import.meta.url) }));
  }
  process.exit(await runMcpCli(mcpArgs));
}

const options = parseCliArgs(args);

if (options.help) {
  console.log(formatHelp());
  process.exit(0);
}

if (options.version) {
  console.log(RELEASE_VERSION.replace(/-desktop$/, ""));
  process.exit(0);
}

const runningInstance = await probeLocalDrawInstance({ baseUrl: LOCALDRAW_URL });
if (runningInstance.kind === "legacy-localdraw") {
  if (process.platform !== "darwin") {
    console.error(
      "An older LocalDraw is already using port 32144. Quit it, then run this command again.",
    );
    process.exit(1);
  }

  console.log("Stopping the older LocalDraw instance on port 32144...");
  try {
    let quitError = null;
    try {
      run("osascript", ["-e", 'tell application id "dev.gulivan.excalidash" to quit']);
    } catch (error) {
      // Some Electrobun releases answer the Apple quit event with -128 even
      // after terminating. Port release is the reliable completion signal.
      quitError = error;
    }
    if (!(await waitForPortRelease({ baseUrl: LOCALDRAW_URL }))) {
      throw quitError ?? new Error("LocalDraw did not release port 32144 within 5 seconds");
    }
  } catch (error) {
    console.error(
      `Unable to replace the older LocalDraw: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}
if (runningInstance.kind === "occupied") {
  console.error(
    `Port 32144 is already in use by another program. LocalDraw did not stop it.\n` +
      `Close that program or free the port, then run this command again.`,
  );
  process.exit(1);
}

if (runningInstance.kind === "localdraw") {
  const requestedVersion = RELEASE_VERSION.replace(/-desktop$/, "");
  const shouldReplace =
    runningInstance.version !== requestedVersion ||
    (runningInstance.channel !== "stable" && runningInstance.channel !== "unknown");

  if (shouldReplace) {
    console.log(
      `Stopping LocalDraw ${runningInstance.version} (${runningInstance.channel}) on port 32144...`,
    );
    try {
      await requestLocalDrawShutdown({
        baseUrl: LOCALDRAW_URL,
        token: runningInstance.shutdownToken,
      });
      if (!(await waitForPortRelease({ baseUrl: LOCALDRAW_URL }))) {
        throw new Error("LocalDraw did not release port 32144 within 5 seconds");
      }
    } catch (error) {
      console.error(
        `Unable to replace the running LocalDraw: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    }
  } else {
    console.log(`LocalDraw ${runningInstance.version} is already running; bringing it forward...`);
  }
}

const sha256 = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

const verifyDownload = async (archivePath, checksumPath) => {
  const expected = readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
  if (!/^[a-f\d]{64}$/i.test(expected) || (await sha256(archivePath)) !== expected) {
    throw new Error("The downloaded application failed its checksum verification.");
  }
};

const installDmg = (archivePath, installDir, workDir) => {
  const mountPath = join(workDir, "mounted");
  mkdirSync(mountPath, { recursive: true });
  run("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mountPath, archivePath]);
  try {
    mkdirSync(dirname(installDir), { recursive: true });
    rmSync(installDir, { recursive: true, force: true });
    run("ditto", [join(mountPath, "LocalDraw.app"), installDir]);
  } finally {
    // APFS can briefly report "resource busy" after copying. A failed detach
    // must not turn a successful installation into a failed npx run.
    spawnSync("hdiutil", ["detach", mountPath], { stdio: "ignore" });
  }
};

const installTarball = (archivePath, installDir) => {
  const nextDir = `${installDir}.next-${process.pid}`;
  rmSync(nextDir, { recursive: true, force: true });
  mkdirSync(nextDir, { recursive: true });
  run("tar", ["-xzf", archivePath, "-C", nextDir]);
  rmSync(installDir, { recursive: true, force: true });
  mkdirSync(dirname(installDir), { recursive: true });
  renameSync(nextDir, installDir);
};

const installExecutable = (archivePath, installDir) => {
  rmSync(installDir, { recursive: true, force: true });
  mkdirSync(installDir, { recursive: true });
  copyFileSync(archivePath, join(installDir, "localdraw-portable.exe"));
};

const findExecutable = (executables) => executables.find(existsSync);
const layout = getInstallLayout();
const explicitlyConfiguredBinary = process.env.LOCALDRAW_BINARY;
let executable = explicitlyConfiguredBinary || findExecutable(layout.executables);
const installedVersion = existsSync(layout.versionFile)
  ? readFileSync(layout.versionFile, "utf8").trim()
  : null;

if (!explicitlyConfiguredBinary && (!executable || installedVersion !== RELEASE_VERSION)) {
  const workDir = join(tmpdir(), `localdraw-${process.pid}`);
  mkdirSync(workDir, { recursive: true });

  try {
    const target = getTarget();
    const archivePath = join(workDir, target.archive);
    const checksumPath = `${archivePath}.sha256`;
    console.log(`Downloading LocalDraw ${RELEASE_VERSION} for ${process.platform}/${process.arch}...`);
    await downloadFile(`${RELEASE_BASE_URL}/${target.archive}`, archivePath);
    await downloadFile(`${RELEASE_BASE_URL}/${target.archive}.sha256`, checksumPath);
    await verifyDownload(archivePath, checksumPath);

    console.log("Installing LocalDraw...");
    if (target.kind === "dmg") installDmg(archivePath, layout.installDir, workDir);
    if (target.kind === "tar.gz") installTarball(archivePath, layout.installDir);
    if (target.kind === "exe") installExecutable(archivePath, layout.installDir);

    executable = findExecutable(layout.executables);
    if (!executable) throw new Error("Installation finished but the application executable was not found.");
    mkdirSync(dirname(layout.versionFile), { recursive: true });
    writeFileSync(layout.versionFile, `${RELEASE_VERSION}\n`);
  } catch (error) {
    console.error(`Unable to install LocalDraw: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  } finally {
    const mountPath = join(workDir, "mounted");
    if (existsSync(mountPath)) {
      spawnSync("hdiutil", ["detach", mountPath], { stdio: "ignore" });
    }
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (!executable) {
  console.error(`LocalDraw ${RELEASE_VERSION} is not installed.`);
  process.exit(1);
}

if (options.browser) {
  process.env.LOCALDRAW_BROWSER_MODE = "1";
  console.log(`Opening LocalDraw in your browser at ${LOCALDRAW_URL}`);
} else {
  console.log("Launching LocalDraw...");
}
const launch = getLaunchCommand({
  appBundle: layout.appBundle,
  executable,
  args: process.platform === "win32" && !explicitlyConfiguredBinary ? [] : args,
  useConfiguredBinary: Boolean(explicitlyConfiguredBinary),
});

if (launch.detached) {
  const child = spawn(launch.command, launch.args, {
    detached: true,
    stdio: verbose ? "inherit" : "ignore",
  });
  child.unref();
} else {
  run(launch.command, launch.args);
}
