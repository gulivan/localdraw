import test from "node:test";
import assert from "node:assert/strict";
import {
  probeLocalDrawInstance,
  requestLocalDrawShutdown,
  waitForPortRelease,
} from "../lib/instance.js";

test("recognizes a LocalDraw instance and its shutdown token", async () => {
  const instance = await probeLocalDrawInstance({
    baseUrl: "http://127.0.0.1:32144",
    fetchImpl: async () => Response.json({
      product: "localdraw",
      version: "0.7.1",
      channel: "stable",
      shutdownToken: "secret",
    }),
  });

  assert.deepEqual(instance, {
    kind: "localdraw",
    product: "localdraw",
    version: "0.7.1",
    channel: "stable",
    shutdownToken: "secret",
  });
});

test("distinguishes an unrelated listener from an available port", async () => {
  const fetchImpl = async () => new Response("not LocalDraw");
  assert.deepEqual(
    await probeLocalDrawInstance({
      baseUrl: "http://127.0.0.1:32144",
      fetchImpl,
      portOpenImpl: async () => true,
    }),
    { kind: "occupied" },
  );
  assert.deepEqual(
    await probeLocalDrawInstance({
      baseUrl: "http://127.0.0.1:32144",
      fetchImpl,
      portOpenImpl: async () => false,
    }),
    { kind: "available" },
  );
});

test("recognizes LocalDraw releases from before the lifecycle endpoint", async () => {
  const responses = [
    new Response("missing", { status: 404 }),
    Response.json({
      path: "/Users/me/Documents/LocalDraw",
      defaultPath: "/Users/me/Documents/LocalDraw",
      formatVersion: 2,
      revision: 4,
      state: "ready",
    }),
  ];

  assert.deepEqual(await probeLocalDrawInstance({
    baseUrl: "http://127.0.0.1:32144",
    fetchImpl: async () => responses.shift(),
  }), { kind: "legacy-localdraw" });
});

test("sends the runtime token when requesting graceful shutdown", async () => {
  let request;
  await requestLocalDrawShutdown({
    baseUrl: "http://127.0.0.1:32144",
    token: "secret",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(null, { status: 202 });
    },
  });

  assert.equal(request.url, "http://127.0.0.1:32144/__localdraw/shutdown");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer secret");
});

test("waits until the LocalDraw port is released", async () => {
  const states = [true, true, false];
  assert.equal(await waitForPortRelease({
    baseUrl: "http://127.0.0.1:32144",
    portOpenImpl: async () => states.shift(),
    pollMs: 0,
  }), true);
});
