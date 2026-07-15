import { BrowserWindow, PATHS, Utils } from "electrobun/bun";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";

const HOST = "127.0.0.1";
const FRONTEND_PORT = 32144;
const BACKEND_PORT = 32145;
const appUrl = `http://${HOST}:${FRONTEND_PORT}`;
const backendUrl = `http://${HOST}:${BACKEND_PORT}`;
const resourcesDir = join(PATHS.RESOURCES_FOLDER, "app");
const backendDir = join(resourcesDir, "backend");
const dataDir = Utils.paths.userData;
const databasePath = join(dataDir, "excalidash.db");
const uploadsDir = join(dataDir, "uploads");

mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadsDir, { recursive: true });
if (!existsSync(databasePath)) {
  copyFileSync(join(resourcesDir, "template.db"), databasePath);
}

Object.assign(process.env, {
  AUTH_MODE: "local",
  BACKUP_DIR: join(dataDir, "backups"),
  CSRF_SECRET: "excalidash-desktop-local-csrf-secret-2026",
  DATABASE_URL: `file:${databasePath}`,
  DISABLE_ONBOARDING_GATE: "true",
  ENFORCE_HTTPS_REDIRECT: "false",
  FRONTEND_URL: appUrl,
  JWT_SECRET: "excalidash-desktop-local-jwt-secret-change-is-not-required",
  NODE_ENV: "production",
  PORT: String(BACKEND_PORT),
  TRUST_PROXY: "false",
  UPLOAD_DIR: uploadsDir,
  UPDATE_CHECK_OUTBOUND: "false",
});

const backend = await import(join(backendDir, "dist/index.js"));
const database = await import(join(backendDir, "dist/db/prisma.js"));

await database.configureSqlite();
await database.prisma.systemConfig.upsert({
  where: { id: "default" },
  update: {
    authEnabled: false,
    authOnboardingCompleted: true,
    registrationEnabled: false,
  },
  create: {
    id: "default",
    authEnabled: false,
    authOnboardingCompleted: true,
    registrationEnabled: false,
    oidcJitProvisioningEnabled: null,
    authLoginRateLimitEnabled: true,
    authLoginRateLimitWindowMs: 900_000,
    authLoginRateLimitMax: 20,
  },
});

await new Promise<void>((resolve, reject) => {
  backend.httpServer.once("error", reject);
  backend.httpServer.listen(BACKEND_PORT, HOST, () => resolve());
});

const frontendDir = join(resourcesDir, "frontend");
Bun.serve({
  hostname: HOST,
  port: FRONTEND_PORT,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const asset = Bun.file(join(frontendDir, requestedPath));
    if (await asset.exists()) return new Response(asset);
    return new Response(Bun.file(join(frontendDir, "index.html")), {
      headers: { "Cache-Control": "no-store" },
    });
  },
});

new BrowserWindow({
  title: "ExcaliDash",
  url: appUrl,
  renderer: process.platform === "linux" ? "cef" : "native",
  frame: {
    width: 1440,
    height: 960,
    x: 80,
    y: 60,
  },
});

console.log(`ExcaliDash is running locally at ${appUrl} (API: ${backendUrl})`);
