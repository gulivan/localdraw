import { connect } from "node:net";

const INSTANCE_PATH = "/__localdraw/instance";
const SHUTDOWN_PATH = "/__localdraw/shutdown";
const LEGACY_WORKSPACE_PATH = "/__localdraw/workspace";

export const isPortOpen = (port, host = "127.0.0.1", timeoutMs = 500) =>
  new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });

export const probeLocalDrawInstance = async ({
  baseUrl,
  fetchImpl = fetch,
  portOpenImpl = isPortOpen,
  timeoutMs = 1_000,
}) => {
  try {
    const response = await fetchImpl(`${baseUrl}${INSTANCE_PATH}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) {
      const body = await response.json();
      if (
        body?.product === "localdraw" &&
        typeof body.version === "string" &&
        typeof body.shutdownToken === "string"
      ) {
        return { kind: "localdraw", ...body };
      }
    }
  } catch {
    // A listener that is not HTTP is still an occupied port.
  }

  try {
    const response = await fetchImpl(`${baseUrl}${LEGACY_WORKSPACE_PATH}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) {
      const body = await response.json();
      if (
        typeof body?.path === "string" &&
        typeof body.defaultPath === "string" &&
        typeof body.formatVersion === "number" &&
        typeof body.revision === "number" &&
        typeof body.state === "string"
      ) {
        return { kind: "legacy-localdraw" };
      }
    }
  } catch {
    // Fall through to distinguish a closed port from another listener.
  }

  const { hostname, port } = new URL(baseUrl);
  return (await portOpenImpl(Number(port), hostname))
    ? { kind: "occupied" }
    : { kind: "available" };
};

export const requestLocalDrawShutdown = async ({
  baseUrl,
  token,
  fetchImpl = fetch,
  timeoutMs = 2_000,
}) => {
  const response = await fetchImpl(`${baseUrl}${SHUTDOWN_PATH}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`LocalDraw refused to stop (${response.status})`);
};

export const waitForPortRelease = async ({
  baseUrl,
  portOpenImpl = isPortOpen,
  timeoutMs = 5_000,
  pollMs = 100,
}) => {
  const { hostname, port } = new URL(baseUrl);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portOpenImpl(Number(port), hostname))) return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
};
