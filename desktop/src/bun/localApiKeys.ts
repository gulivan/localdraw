import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { atomicWrite } from "./filesystemWorkspaceFormat";

export const LOCAL_API_KEY_SCOPES = [
  "drawings:read",
  "drawings:write",
  "collections:read",
  "collections:write",
] as const;

export type LocalApiKeyMetadata = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredLocalApiKey = LocalApiKeyMetadata & {
  keyId: string;
  tokenHash: string;
};

const MAX_KEYS = 100;
const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const publicKey = ({ keyId: _keyId, tokenHash: _tokenHash, ...metadata }: StoredLocalApiKey): LocalApiKeyMetadata => metadata;

export class LocalApiKeyStore {
  private operation: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  private async read(): Promise<StoredLocalApiKey[]> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async write(keys: StoredLocalApiKey[]): Promise<void> {
    await atomicWrite(this.path, `${JSON.stringify(keys, null, 2)}\n`);
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.operation.then(task, task);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  async list(): Promise<LocalApiKeyMetadata[]> {
    return (await this.read()).map(publicKey).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async create(name: string, requestedScopes?: unknown): Promise<{ apiKey: LocalApiKeyMetadata; token: string }> {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) throw new Error("API key name must be between 1 and 100 characters");
    const allowed = new Set<string>(LOCAL_API_KEY_SCOPES);
    const scopes = requestedScopes === undefined
      ? [...LOCAL_API_KEY_SCOPES]
      : Array.isArray(requestedScopes)
        ? [...new Set(requestedScopes.filter((scope): scope is string => typeof scope === "string" && allowed.has(scope)))]
        : [];
    if (scopes.length === 0 || (Array.isArray(requestedScopes) && scopes.length !== requestedScopes.length)) {
      throw new Error("Select at least one valid API key scope");
    }
    return this.exclusive(async () => {
      const keys = await this.read();
      if (keys.filter((key) => !key.revokedAt).length >= MAX_KEYS) throw new Error("Too many active API keys");
      const keyId = randomBytes(12).toString("base64url");
      const token = `exd_${keyId}_${randomBytes(32).toString("base64url")}`;
      const now = new Date().toISOString();
      const stored: StoredLocalApiKey = {
        id: randomUUID(),
        keyId,
        tokenHash: hashToken(token),
        name: trimmedName,
        prefix: token.slice(0, 16),
        scopes,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      keys.push(stored);
      await this.write(keys);
      return { apiKey: publicKey(stored), token };
    });
  }

  async revoke(id: string): Promise<boolean> {
    return this.exclusive(async () => {
      const keys = await this.read();
      const key = keys.find((candidate) => candidate.id === id);
      if (!key) return false;
      if (!key.revokedAt) {
        key.revokedAt = new Date().toISOString();
        key.updatedAt = key.revokedAt;
        await this.write(keys);
      }
      return true;
    });
  }

  async authenticate(token: string): Promise<LocalApiKeyMetadata | null> {
    if (!/^exd_[A-Za-z0-9_-]{8,64}_[A-Za-z0-9_-]{20,}$/.test(token)) return null;
    return this.exclusive(async () => {
      const keys = await this.read();
      if (token[20] !== "_") return null;
      const keyId = token.slice(4, 20);
      const key = keys.find((candidate) => candidate.keyId === keyId && !candidate.revokedAt);
      if (!key) return null;
      const computed = Buffer.from(hashToken(token), "hex");
      const stored = Buffer.from(key.tokenHash, "hex");
      if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) return null;
      key.lastUsedAt = new Date().toISOString();
      key.updatedAt = key.lastUsedAt;
      await this.write(keys);
      return publicKey(key);
    });
  }
}
