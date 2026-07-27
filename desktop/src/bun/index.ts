import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  PATHS,
  Utils,
} from "electrobun/bun";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createXiaolaiFontServer } from "./xiaolai";
import { FilesystemWorkspace } from "./filesystemWorkspace";
import { createLocalApi } from "./localApi";

const HOST = "127.0.0.1";
const FRONTEND_PORT = 32144;
const appUrl = `http://${HOST}:${FRONTEND_PORT}`;
const browserMode =
  process.argv.includes("--browser") ||
  process.env.LOCALDRAW_BROWSER_MODE === "1";
const skipBrowserOpen = process.env.LOCALDRAW_SKIP_BROWSER_OPEN === "1";
const browserLifecycleToken = browserMode ? randomUUID() : null;
const resourcesDir = join(PATHS.RESOURCES_FOLDER, "app");
const dataDir = Utils.paths.userData;
const serveXiaolaiFont = await createXiaolaiFontServer(resourcesDir, dataDir);
const workspace = new FilesystemWorkspace(
  dataDir,
  join(Utils.paths.documents, "LocalDraw"),
);
await workspace.initialize();
const localApi = createLocalApi(
  workspace,
  process.env.ELECTROBUN_APP_VERSION || "0.0.0",
  appUrl,
);

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
    frontendServer?.stop(false);
    try {
      workspace.close();
      await workspace.flush();
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

ApplicationMenu.on("application-menu-clicked", (event) => {
  if ((event as any).data?.action === "quit") void shutdown();
});

Electrobun.events.on("new-window-open", (event) => {
  const detail = (event as any).data?.detail;
  const externalUrl = typeof detail === "string" ? detail : detail?.url;

  if (typeof externalUrl !== "string") return;

  try {
    const url = new URL(externalUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      Utils.openExternal(url.href);
    }
  } catch {
    // Ignore malformed URLs emitted by the native webview.
  }
});

frontendServer = Bun.serve({
  hostname: HOST,
  maxRequestBodySize: 50 * 1024 * 1024,
  port: FRONTEND_PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const apiResponse = await localApi(request);
    if (apiResponse) return apiResponse;
    if (pathname === "/__localdraw/workspace" && request.method === "GET") {
      return Response.json(workspace.getStatus(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (pathname.startsWith("/__localdraw/workspace/") && request.method === "POST") {
      if (request.headers.get("origin") !== appUrl) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      try {
        if (pathname.endsWith("/open-existing")) {
          const selected = (await Utils.openFileDialog({
            startingFolder: workspace.getStatus().path,
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          }))[0]?.trim() ?? "";
          if (selected) await workspace.openRoot(selected);
          return Response.json({ ...workspace.getStatus(), changed: Boolean(selected) });
        }
        if (pathname.endsWith("/move")) {
          const selected = (await Utils.openFileDialog({
            startingFolder: workspace.getStatus().defaultPath,
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          }))[0]?.trim() ?? "";
          if (selected) await workspace.moveRoot(selected);
          return Response.json({ ...workspace.getStatus(), changed: Boolean(selected) });
        }
        if (pathname.endsWith("/reveal")) {
          Utils.openPath(workspace.getStatus().path);
          return Response.json({ ...workspace.getStatus(), opened: true });
        }
        if (pathname.endsWith("/rescan")) {
          await workspace.rescan();
          return Response.json({ ...workspace.getStatus(), rescanned: true });
        }
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Workspace operation failed" },
          { status: 400 },
        );
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (pathname === "/__localdraw/events" && request.method === "GET") {
      let unsubscribe: () => void = () => undefined;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const send = (revision: number) => controller.enqueue(
            encoder.encode(`event: workspace-changed\ndata: ${JSON.stringify({ revision })}\n\n`),
          );
          unsubscribe = workspace.onChange(send);
          controller.enqueue(encoder.encode(": connected\n\n"));
        },
        cancel() {
          unsubscribe();
        },
      });
      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
        },
      });
    }
    if (request.method === "GET") {
      const fontResponse = await serveXiaolaiFont(pathname);
      if (fontResponse) return fontResponse;
    }
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

if (browserMode) {
  if (!skipBrowserOpen) Utils.openExternal(appUrl);
} else {
  openNativeWindow();
}

console.log(
  `LocalDraw is running locally at ${appUrl} (filesystem API, renderer: ${browserMode ? "browser" : "native"})`,
);
