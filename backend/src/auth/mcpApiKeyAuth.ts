import type { RequestHandler } from "express";
import type { PrismaClient } from "../generated/client";
import type { AuthModeService } from "./authMode";
import { BOOTSTRAP_USER_ID } from "./authMode";
import {
  apiKeyHashMatches,
  DEFAULT_API_KEY_SCOPES,
  extractApiKeyId,
  isApiKeyToken,
  parseApiKeyScopes,
} from "./apiKeys";

export type McpApiKeyPrincipal = {
  apiKeyId: string;
  userId: string;
  scopes: string[];
};

declare global {
  namespace Express {
    interface Request {
      mcpPrincipal?: McpApiKeyPrincipal;
    }
  }
}

const extractBearer = (authorization: string | undefined): string | null => {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  return scheme === "Bearer" && token ? token : null;
};

export const authenticateMcpApiKey = async (
  prisma: PrismaClient,
  authModeService: AuthModeService,
  token: string,
): Promise<McpApiKeyPrincipal | null> => {
  if (!isApiKeyToken(token)) return null;
  const keyId = extractApiKeyId(token);
  if (!keyId) return null;
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyId },
    include: { user: true },
  });
  if (!apiKey || apiKey.revokedAt || !apiKeyHashMatches(token, apiKey.tokenHash)) {
    return null;
  }

  const authEnabled = await authModeService.getAuthEnabled();
  const validUser = authEnabled
    ? apiKey.user.isActive
    : apiKey.userId === BOOTSTRAP_USER_ID;
  if (!validUser) return null;

  const scopes = parseApiKeyScopes(apiKey.scopes);
  if (!DEFAULT_API_KEY_SCOPES.every((scope) => scopes.includes(scope))) {
    return null;
  }
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });
  return { apiKeyId: apiKey.id, userId: apiKey.userId, scopes };
};

export const createMcpApiKeyMiddleware = (
  prisma: PrismaClient,
  authModeService: AuthModeService,
): RequestHandler => async (req, res, next) => {
  const token = extractBearer(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "Unauthorized", message: "MCP bearer API key required" });
    return;
  }
  try {
    const principal = await authenticateMcpApiKey(prisma, authModeService, token);
    if (!principal) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid, revoked, or incomplete-scope API key" });
      return;
    }
    req.mcpPrincipal = principal;
    next();
  } catch (error) {
    console.error("MCP API key authentication failed", error);
    res.status(500).json({ error: "Internal server error", message: "Failed to authenticate MCP connection" });
  }
};
