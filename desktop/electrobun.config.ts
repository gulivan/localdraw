import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "ExcaliDash",
    identifier: "dev.gulivan.excalidash",
    version: "0.5.1",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      "build/backend": "backend",
      "../frontend/dist": "frontend",
      "build/template.db": "template.db",
    },
    mac: { bundleCEF: false },
    linux: { bundleCEF: true, defaultRenderer: "cef" },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
