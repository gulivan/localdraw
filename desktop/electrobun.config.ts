import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "LocalDraw",
    identifier: "dev.gulivan.excalidash",
    version: "0.5.8",
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
      "build/backend": "backend",
      "../frontend/dist": "frontend",
      "build/template.db": "template.db",
      "build/xiaolai-manifest.json": "xiaolai-manifest.json",
    },
    mac: { bundleCEF: false, icons: "icon.iconset" },
    linux: { bundleCEF: false, defaultRenderer: "native" },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
