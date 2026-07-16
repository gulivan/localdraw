import { resolve } from "node:path";
import { createRequire } from "node:module";

const [entrypoint, outfile] = process.argv.slice(2);
if (!entrypoint || !outfile) {
  throw new Error("Usage: bun bundle-backend.mjs <entrypoint> <outfile>");
}

const stubsDir = resolve(import.meta.dirname, "../src/stubs");
const backendDir = resolve(entrypoint, "../..");
const requireFromBackend = createRequire(resolve(backendDir, "package.json"));
const desktopOnlyModules = new Map([
  [
    "@prisma/adapter-better-sqlite3",
    requireFromBackend.resolve("@prisma/adapter-better-sqlite3"),
  ],
  ["better-sqlite3", resolve(stubsDir, "better-sqlite3.ts")],
  ["bcrypt", resolve(stubsDir, "bcrypt.ts")],
  ["openid-client", resolve(stubsDir, "openid-client.ts")],
  ["@aws-sdk/client-s3", resolve(stubsDir, "aws-s3.ts")],
  ["@aws-sdk/s3-request-presigner", resolve(stubsDir, "aws-presigner.ts")],
]);

const result = await Bun.build({
  entrypoints: [entrypoint],
  target: "bun",
  format: "cjs",
  minify: true,
  define: { __EXCALIDASH_DESKTOP__: "true" },
  external: ["*generated/client"],
  plugins: [{
    name: "localdraw-server-feature-stubs",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        const replacement = desktopOnlyModules.get(args.path);
        return replacement ? { path: replacement } : undefined;
      });
    },
  }],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const bundledEntry = result.outputs.find((output) => output.kind === "entry-point");
if (!bundledEntry) throw new Error("Desktop backend build produced no entry point");
await Bun.write(outfile, bundledEntry);
