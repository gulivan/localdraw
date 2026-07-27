import type { ElectrobunConfig } from "electrobun";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default {
  app: {
    name: "LocalDraw",
    identifier: "dev.gulivan.excalidash",
    version: packageJson.version,
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      minify: true,
    },
    copy: {
      "../frontend/dist": "frontend",
      "build/xiaolai-manifest.json": "xiaolai-manifest.json",
    },
    mac: { bundleCEF: false, icons: "icon.iconset" },
    linux: { bundleCEF: false, defaultRenderer: "native" },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
