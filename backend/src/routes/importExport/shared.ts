import express from "express";
import path from "path";
import { PrismaClient } from "../../generated/client";

export type RegisterImportExportDeps = {
  app: express.Express;
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => Promise<T>,
  ) => express.RequestHandler;
  getBackendVersion: () => string;
  parseJsonField: <T>(rawValue: string | null | undefined, fallback: T) => T;
};

const normalizeArchivePath = (filePath: string): string =>
  path.posix.normalize(filePath.replace(/\\/g, "/"));

export const assertSafeArchivePath = (filePath: string) => {
  const normalized = normalizeArchivePath(filePath);
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("\0")
  ) {
    throw new Error(`Unsafe archive path: ${filePath}`);
  }
};

export const sanitizePathSegment = (input: string, fallback: string): string => {
  const value = typeof input === "string" ? input.trim() : "";
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
  const withoutLeadingDots = cleaned.replace(/^\.+/, "").trim();
  if (withoutLeadingDots.length === 0) return fallback;
  if (withoutLeadingDots === "." || withoutLeadingDots === "..") return fallback;
  return withoutLeadingDots;
};

export const makeUniqueName = (base: string, used: Set<string>): string => {
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}__${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
};

export const getUserTrashCollectionId = (userId: string): string =>
  `trash:${userId}`;

export const isTrashCollectionId = (
  collectionId: string | null | undefined,
  userId: string,
): boolean =>
  Boolean(collectionId) &&
  (collectionId === "trash" ||
    collectionId === getUserTrashCollectionId(userId));

export const toPublicTrashCollectionId = (
  collectionId: string | null | undefined,
  userId: string,
): string | null =>
  isTrashCollectionId(collectionId, userId) ? "trash" : collectionId ?? null;
