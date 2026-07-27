import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export const APP_VERSION = packageJson.version;
export const RELEASE_VERSION = `${APP_VERSION}-desktop`;

export const getTarget = (platform = process.platform, arch = process.arch) => {
  if (platform === "darwin" && ["arm64", "x64"].includes(arch)) {
    return {
      archive: `localdraw-${APP_VERSION}-darwin-${arch}.dmg`,
      kind: "dmg",
    };
  }

  if (platform === "linux" && arch === "x64") {
    return {
      archive: `localdraw-${APP_VERSION}-linux-x64.tar.gz`,
      kind: "tar.gz",
    };
  }

  if (platform === "win32" && ["x64", "arm64"].includes(arch)) {
    return {
      archive: `localdraw-${APP_VERSION}-win-x64-portable.exe`,
      kind: "exe",
    };
  }

  throw new Error(`No LocalDraw build is available for ${platform}/${arch}.`);
};

export const getInstallLayout = (
  platform = process.platform,
  home = homedir(),
  localAppData = process.env.LOCALAPPDATA,
) => {
  if (platform === "darwin") {
    const app = join(home, "Applications", "LocalDraw.app");
    return {
      appBundle: app,
      installDir: app,
      executables: [
        join(app, "Contents/MacOS/launcher"),
        "/Applications/LocalDraw.app/Contents/MacOS/launcher",
      ],
      versionFile: join(home, ".local", "share", "localdraw", "version"),
    };
  }

  if (platform === "linux") {
    const installDir = join(home, ".local", "share", "localdraw", "app");
    return {
      installDir,
      executables: [join(installDir, "bin", "launcher")],
      versionFile: join(home, ".local", "share", "localdraw", "version"),
    };
  }

  const base = localAppData || join(home, "AppData", "Local");
  const installDir = join(base, "LocalDraw");
  return {
    installDir,
    executables: [join(installDir, "localdraw-portable.exe")],
    versionFile: join(installDir, "launcher-version"),
  };
};
