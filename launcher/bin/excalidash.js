#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  RELEASE_VERSION,
  getInstallLayout,
  getTarget,
} from "../lib/platform.js";
import { createCommandRunner, getLaunchCommand } from "../lib/process.js";

const RELEASE_BASE_URL = `https://github.com/gulivan/localdraw/releases/download/v${RELEASE_VERSION}`;
const verbose = process.env.LOCALDRAW_VERBOSE === "1";
const run = createCommandRunner({ verbose });

const download = async (url, destination) => {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status} ${response.statusText})`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
};

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
    run("ditto", [join(mountPath, "ExcaliDash.app"), installDir]);
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

const installZip = (archivePath, installDir) => {
  rmSync(installDir, { recursive: true, force: true });
  mkdirSync(installDir, { recursive: true });
  const escapedArchive = archivePath.replaceAll("'", "''");
  const escapedInstallDir = installDir.replaceAll("'", "''");
  run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedInstallDir}' -Force`,
  ]);
};

const findExecutable = (executables) => executables.find(existsSync);
const layout = getInstallLayout();
const explicitlyConfiguredBinary = process.env.EXCALIDASH_BINARY;
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
    await download(`${RELEASE_BASE_URL}/${target.archive}`, archivePath);
    await download(`${RELEASE_BASE_URL}/${target.archive}.sha256`, checksumPath);
    await verifyDownload(archivePath, checksumPath);

    console.log("Installing LocalDraw...");
    if (target.kind === "dmg") installDmg(archivePath, layout.installDir, workDir);
    if (target.kind === "tar.gz") installTarball(archivePath, layout.installDir);
    if (target.kind === "zip") installZip(archivePath, layout.installDir);

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

console.log("Launching LocalDraw...");
const launch = getLaunchCommand({
  appBundle: layout.appBundle,
  executable,
  args: process.argv.slice(2),
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
