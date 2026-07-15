import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  PATHS,
  Utils,
} from "electrobun/bun";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const HOST = "127.0.0.1";
const FRONTEND_PORT = 32144;
const BACKEND_PORT = 32145;
const appUrl = `http://${HOST}:${FRONTEND_PORT}`;
const backendUrl = `http://${HOST}:${BACKEND_PORT}`;
const browserMode =
  process.argv.includes("--browser") ||
  process.env.LOCALDRAW_BROWSER_MODE === "1";
const skipBrowserOpen = process.env.LOCALDRAW_SKIP_BROWSER_OPEN === "1";
const browserLifecycleToken = browserMode ? randomUUID() : null;
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
const indexFile = Bun.file(join(frontendDir, "index.html"));
const browserLifecycleScript = browserLifecycleToken
  ? `<script>(()=>{const token=${JSON.stringify(browserLifecycleToken)};const heartbeat=()=>fetch('/__localdraw/heartbeat',{method:'POST',body:token,keepalive:true}).catch(()=>{});heartbeat();const timer=setInterval(heartbeat,1000);addEventListener('pagehide',()=>{clearInterval(timer);navigator.sendBeacon('/__localdraw/quit',token);});})();</script>`
  : "";
const browserIndexHtml = browserLifecycleToken
  ? (await indexFile.text()).replace("</body>", `${browserLifecycleScript}</body>`)
  : null;
let browserQuitTimer: ReturnType<typeof setTimeout> | null = null;
let frontendServer: ReturnType<typeof Bun.serve> | null = null;
let shutdownPromise: Promise<void> | null = null;

const shutdown = () => {
  shutdownPromise ??= (async () => {
    if (browserQuitTimer) clearTimeout(browserQuitTimer);
    frontendServer?.stop(true);
    backend.httpServer.close();
    try {
      await database.prisma.$disconnect();
    } finally {
      Utils.quit();
    }
  })();
  return shutdownPromise;
};

ApplicationMenu.setApplicationMenu([
  {
    label: "LocalDraw",
    submenu: [
      {
        label: "Quit LocalDraw",
        action: "quit",
        accelerator:
          process.platform === "darwin" ? "CommandOrControl+Q" : "Alt+F4",
      },
    ],
  },
]);

Electrobun.events.on("application-menu-clicked", (event) => {
  if ((event as any).data?.action === "quit") void shutdown();
});

frontendServer = Bun.serve({
  hostname: HOST,
  port: FRONTEND_PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (
      browserLifecycleToken &&
      request.method === "POST" &&
      (pathname === "/__localdraw/heartbeat" ||
        pathname === "/__localdraw/quit")
    ) {
      if ((await request.text()) !== browserLifecycleToken) {
        return new Response(null, { status: 403 });
      }
      if (pathname === "/__localdraw/heartbeat") {
        if (browserQuitTimer) {
          clearTimeout(browserQuitTimer);
          browserQuitTimer = null;
        }
      } else {
        if (browserQuitTimer) clearTimeout(browserQuitTimer);
        browserQuitTimer = setTimeout(() => void shutdown(), 2_000);
      }
      return new Response(null, { status: 204 });
    }
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    if (browserIndexHtml && requestedPath === "/index.html") {
      return new Response(browserIndexHtml, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }
    const asset = Bun.file(join(frontendDir, requestedPath));
    if (await asset.exists()) return new Response(asset);
    return new Response(browserIndexHtml ?? indexFile, {
      headers: { "Cache-Control": "no-store" },
    });
  },
});

const openNativeWindow = () =>
  new BrowserWindow({
    title: "LocalDraw",
    url: appUrl,
    renderer: "native",
    frame: {
      width: 1440,
      height: 960,
      x: 80,
      y: 60,
    },
  });

const openedInBrowser =
  browserMode && (skipBrowserOpen || Utils.openExternal(appUrl));
if (!openedInBrowser) {
  openNativeWindow();
}

console.log(
  `LocalDraw is running locally at ${appUrl} (API: ${backendUrl}, renderer: ${openedInBrowser ? "browser" : "native"})`,
);
