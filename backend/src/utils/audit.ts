/**
 * Audit logging utility for security events
 */
import { prisma } from "../db/prisma";

let prismaProvider: () => typeof prisma = () => prisma;

export const setAuditPrismaProvider = (provider: (() => typeof prisma) | null): void => {
  prismaProvider = provider ?? (() => prisma);
};

export interface AuditLogData {
  userId?: string;
  action: string;
  resource?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * Log a security event to the audit log
 * This should be called for important security-related actions
 * Gracefully handles missing audit log table (feature disabled)
 */
export const logAuditEvent = async (data: AuditLogData): Promise<void> => {
  try {
    const { config } = await import("../config");
    if (!config.enableAuditLogging) {
      return; // Feature disabled, silently skip
    }

    await prismaProvider().auditLog.create({
      data: {
        userId: data.userId || null,
        action: data.action,
        resource: data.resource || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        details: data.details ? JSON.stringify(data.details) : null,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.debug("Audit logging skipped (feature disabled or table missing):", error);
    }
  }
};
