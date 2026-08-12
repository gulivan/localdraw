import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { generateApiKey, serializeApiKeyScopes } from "../auth/apiKeys";
import { getTestPrisma, setupTestDb } from "./testUtils";

type ApiKeyFixture = {
  id: string;
  token: string;
};

async function createApiKeyFixture(
  prisma: PrismaClient,
  userId: string,
  name: string,
): Promise<ApiKeyFixture> {
  const generated = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyId: generated.keyId,
      tokenHash: generated.tokenHash,
      prefix: generated.prefix,
      scopes: serializeApiKeyScopes(),
    },
    select: { id: true },
  });

  return { id: apiKey.id, token: generated.token };
}

describe("API key authentication", () => {
  let prisma: PrismaClient;
  let app: any;
  let userId: string;
  let apiKeyId: string;
  let apiKeyToken: string;
  let adminApiKeyToken: string;
  let adminUserId: string;
  let userAccessToken: string;
  let agent: ReturnType<typeof request.agent>;
  let csrfHeaderName: string;
  let csrfToken: string;
  const userAgent = "api-key-integration-test";

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true, registrationEnabled: false },
      create: { id: "default", authEnabled: true, registrationEnabled: false },
    });

    const passwordHash = await bcrypt.hash("password123", 10);
    const user = await prisma.user.create({
      data: {
        email: "api-key-user@test.local",
        passwordHash,
        name: "API Key User",
        role: "USER",
        isActive: true,
      },
      select: { id: true },
    });
    userId = user.id;
    userAccessToken = jwt.sign(
      { userId, email: "api-key-user@test.local", type: "access" },
      config.jwtSecret,
    );
    agent = request.agent(app);
    const csrfResponse = await agent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    csrfHeaderName = csrfResponse.body.header;
    csrfToken = csrfResponse.body.token;

    const apiKeyFixture = await createApiKeyFixture(prisma, userId, "Obsidian automation");
    apiKeyToken = apiKeyFixture.token;
    apiKeyId = apiKeyFixture.id;

    const adminUser = await prisma.user.create({
      data: {
        email: "api-key-admin@test.local",
        passwordHash,
        name: "API Key Admin",
        role: "ADMIN",
        isActive: true,
      },
      select: { id: true },
    });
    adminUserId = adminUser.id;
    const adminApiKeyFixture = await createApiKeyFixture(prisma, adminUser.id, "Admin automation");
    adminApiKeyToken = adminApiKeyFixture.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts API key bearer auth for write API requests without CSRF", async () => {
    const response = await request(app)
      .post("/collections")
      .set("Authorization", `Bearer ${apiKeyToken}`)
      .send({ name: "Automation" });

    expect(response.status).toBe(200);
    expect(response.body?.name).toBe("Automation");
    expect(response.body?.userId).toBe(userId);

    const stored = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    expect(stored?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("accepts API key bearer auth for allowed read routes", async () => {
    const collectionsResponse = await request(app)
      .get("/collections")
      .set("Authorization", `Bearer ${apiKeyToken}`);
    const drawingsResponse = await request(app)
      .get("/drawings")
      .set("Authorization", `Bearer ${apiKeyToken}`);

    expect(collectionsResponse.status).toBe(200);
    expect(drawingsResponse.status).toBe(200);
  });

  it("searches typed canvas text without matching non-text element metadata", async () => {
    const typedMatch = await prisma.drawing.create({
      data: {
        name: "Untitled canvas",
        elements: JSON.stringify([
          { type: "text", text: "CanvasSearchNeedle", isDeleted: false },
        ]),
        appState: "{}",
        files: "{}",
        userId,
      },
    });
    const metadataOnly = await prisma.drawing.create({
      data: {
        name: "Another canvas",
        elements: JSON.stringify([
          { type: "rectangle", id: "CanvasSearchNeedle" },
        ]),
        appState: "{}",
        files: "{}",
        userId,
      },
    });

    const response = await request(app)
      .get("/drawings?search=canvassearchneedle")
      .set("Authorization", `Bearer ${apiKeyToken}`);

    expect(response.status).toBe(200);
    expect(response.body.totalCount).toBe(1);
    expect(response.body.drawings.map((drawing: any) => drawing.id)).toEqual([
      typedMatch.id,
    ]);
    expect(response.body.drawings[0].elements).toBeUndefined();
    expect(response.body.drawings.map((drawing: any) => drawing.id)).not.toContain(
      metadataOnly.id,
    );
  });

  it("creates an initial canvas and returns project overview metadata", async () => {
    const createResponse = await request(app)
      .post("/collections")
      .set("Authorization", `Bearer ${apiKeyToken}`)
      .send({
        name: "Launch story",
        color: "#0ea5e9",
        createInitialDrawing: true,
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body?.color).toBe("#0ea5e9");
    expect(createResponse.body?.initialDrawingId).toEqual(expect.any(String));
    expect(createResponse.body?.initialDrawing).toEqual({
      id: createResponse.body.initialDrawingId,
      updatedAt: expect.any(String),
    });

    const overviewResponse = await request(app)
      .get("/collections?includeOverview=true")
      .set("Authorization", `Bearer ${apiKeyToken}`);
    const project = overviewResponse.body.find(
      (collection: { id: string }) => collection.id === createResponse.body.id,
    );

    expect(overviewResponse.status).toBe(200);
    expect(project).toMatchObject({
      drawingCount: 1,
      latestDrawing: {
        id: createResponse.body.initialDrawingId,
        name: "Untitled canvas",
        sortOrder: 0,
      },
    });
    expect(new Date(project.lastActivityAt).getTime()).not.toBeNaN();
  });

  it("orders owned canvases through the placement route", async () => {
    const project = await prisma.collection.create({
      data: { name: "Ordered project", userId },
    });
    const first = await prisma.drawing.create({
      data: {
        name: "First",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId,
        collectionId: project.id,
        sortOrder: 0,
      },
    });
    const second = await prisma.drawing.create({
      data: {
        name: "Second",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId,
        collectionId: project.id,
        sortOrder: 1,
      },
    });

    const response = await agent
      .patch(`/drawings/${second.id}/placement`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${userAccessToken}`)
      .set(csrfHeaderName, csrfToken)
      .send({ collectionId: project.id, targetIndex: 0 });

    expect(response.status).toBe(200);
    expect(response.body.orders[0].items).toEqual([
      { id: second.id, sortOrder: 0 },
      { id: first.id, sortOrder: 1 },
    ]);
  });

  it("places a duplicate immediately after its source canvas", async () => {
    const project = await prisma.collection.create({
      data: { name: "Duplicate order project", userId },
    });
    const first = await prisma.drawing.create({
      data: {
        name: "First",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId,
        collectionId: project.id,
        sortOrder: 0,
      },
    });
    const second = await prisma.drawing.create({
      data: {
        name: "Second",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId,
        collectionId: project.id,
        sortOrder: 1,
      },
    });

    const response = await agent
      .post(`/drawings/${first.id}/duplicate`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${userAccessToken}`)
      .set(csrfHeaderName, csrfToken);

    expect(response.status).toBe(200);
    const ordered = await prisma.drawing.findMany({
      where: { collectionId: project.id, userId },
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    expect(ordered).toEqual([
      { id: first.id, sortOrder: 0 },
      { id: response.body.id, sortOrder: 1 },
      { id: second.id, sortOrder: 2 },
    ]);
  });

  it("does not let a project owner reorder another user's drawing", async () => {
    const project = await prisma.collection.create({
      data: { name: "Cross-owner project", userId },
    });
    const foreignDrawing = await prisma.drawing.create({
      data: {
        name: "Foreign drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: adminUserId,
        collectionId: project.id,
        sortOrder: 7,
      },
    });

    const response = await agent
      .patch(`/drawings/${foreignDrawing.id}/placement`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${userAccessToken}`)
      .set(csrfHeaderName, csrfToken)
      .send({ collectionId: project.id, targetIndex: 0 });

    expect(response.status).toBe(404);
    await expect(
      prisma.drawing.findUnique({ where: { id: foreignDrawing.id } }),
    ).resolves.toMatchObject({ collectionId: project.id, sortOrder: 7 });
  });

  it("rejects API key management with API key auth", async () => {
    const response = await request(app)
      .get("/auth/api-keys")
      .set("Authorization", `Bearer ${apiKeyToken}`);

    expect(response.status).toBe(403);
  });

  it("rejects admin actions with admin-owned API key auth", async () => {
    const response = await request(app)
      .get("/auth/users")
      .set("Authorization", `Bearer ${adminApiKeyToken}`)
      .send();

    expect(response.status).toBe(403);
  });

  it("stores only hashed API keys and metadata", async () => {
    const stored = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });

    expect(stored?.tokenHash).toBeTruthy();
    expect(stored?.tokenHash).not.toBe(apiKeyToken);
    expect(stored?.keyId).not.toBe(apiKeyToken);
    expect(stored?.prefix).toBe(apiKeyToken.slice(0, 16));
  });

  it("rejects invalid API keys", async () => {
    const response = await request(app)
      .post("/collections")
      .set("Authorization", "Bearer exd_invalid_invalid")
      .send({ name: "Invalid" });

    expect(response.status).toBe(401);
  });

  it("rejects revoked API keys", async () => {
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });

    const response = await request(app)
      .post("/collections")
      .set("Authorization", `Bearer ${apiKeyToken}`)
      .send({ name: "Revoked" });

    expect(response.status).toBe(401);
  });
});
