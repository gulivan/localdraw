import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "ExcaliDash",
    identifier: "dev.gulivan.excalidash",
    version: "0.5.7",
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
    linux: { bundleCEF: false, defaultRenderer: "native" },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
