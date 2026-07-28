import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthModeService, BOOTSTRAP_USER_ID } from "../auth/authMode";
import { generateApiKey, serializeApiKeyScopes } from "../auth/apiKeys";
import { getTestPrisma, setupTestDb } from "../__tests__/testUtils";
import { registerMcpServer } from "./server";

describe("MCP Streamable HTTP server", () => {
  const prisma = getTestPrisma();
  const app = express();
  const generated = generateApiKey();
  let storedKeyId = "";
  let sessionId = "";

  beforeAll(async () => {
    setupTestDb();
    app.use(express.json());
    await prisma.user.create({
      data: {
        id: BOOTSTRAP_USER_ID,
        email: "bootstrap@excalidash.local",
        passwordHash: "",
        name: "Bootstrap Admin",
        role: "ADMIN",
        mustResetPassword: true,
        isActive: false,
      },
    });
    await prisma.systemConfig.create({
      data: {
        id: "default",
        authEnabled: false,
        authOnboardingCompleted: true,
        registrationEnabled: false,
      },
    });
    const key = await prisma.apiKey.create({
      data: {
        userId: BOOTSTRAP_USER_ID,
        name: "Desktop AI",
        keyId: generated.keyId,
        tokenHash: generated.tokenHash,
        prefix: generated.prefix,
        scopes: serializeApiKeyScopes(),
      },
    });
    storedKeyId = key.id;
    registerMcpServer(app, {
      prisma,
      io: { to: () => ({ emit: () => undefined }) } as any,
      authModeService: createAuthModeService(prisma, { authEnabledTtlMs: 0 }),
      invalidateDrawingsCache: () => undefined,
      version: "test",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("always requires a bearer key, including auth-disabled mode", async () => {
    const response = await request(app).post("/mcp").send({});
    expect(response.status).toBe(401);
  });

  it("initializes a keyed session for the inactive bootstrap identity", async () => {
    const response = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${generated.token}`)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "integration-test", version: "1" },
        },
      });

    expect(response.status).toBe(200);
    expect(response.headers["mcp-session-id"]).toEqual(expect.any(String));
    sessionId = response.headers["mcp-session-id"];
    expect(response.text).toContain("excalidash");
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: storedKeyId } });
    expect(stored.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects an active session immediately after its key is revoked", async () => {
    await prisma.apiKey.update({ where: { id: storedKeyId }, data: { revokedAt: new Date() } });
    const response = await request(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${generated.token}`)
      .set("Mcp-Session-Id", sessionId)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      });
    expect(response.status).toBe(401);
  });
});
