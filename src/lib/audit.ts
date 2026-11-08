import "server-only";
import { z } from "zod";
import type { AuditEvent, Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { actorSchema, type Actor } from "./types";

const auditInputSchema = z.object({
  userId: z.string().trim().min(1, "userId is required"),
  actor: actorSchema,
  action: z.string().trim().min(1, "action is required").max(200),
});

/** Round-trip through JSON so Dates become ISO strings and undefined fields disappear. */
function toJsonPayload(payload: unknown): Prisma.InputJsonValue {
  if (payload === undefined || payload === null) return {};
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Audit payload must be JSON-serializable: ${detail}`);
  }
  if (serialized === undefined) {
    throw new Error("Audit payload must be JSON-serializable (got a function or symbol)");
  }
  const value: unknown = JSON.parse(serialized);
  return value === null ? {} : (value as Prisma.InputJsonValue);
}

/** Anything that can insert an audit row: `db`, or a transaction client. */
export type AuditClient = Pick<Prisma.TransactionClient, "auditEvent">;

/**
 * Record what happened and who did it (ground rule 6). Throws on invalid input or DB failure:
 * callers must not silently continue when the audit trail can't be written. Pass the transaction client
 * as `client` when the audit belongs to a state change, so both commit or roll back together.
 */
export async function writeAudit(
  userId: string,
  actor: Actor,
  action: string,
  payload: unknown,
  client: AuditClient = db,
): Promise<void> {
  const parsed = auditInputSchema.safeParse({ userId, actor, action });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid audit event (${issues})`);
  }
  await client.auditEvent.create({
    data: {
      userId: parsed.data.userId,
      actor: parsed.data.actor,
      action: parsed.data.action,
      payload: toJsonPayload(payload),
    },
  });
}

export interface ListAuditOptions {
  actor?: Actor;
  limit?: number;
}

const MAX_AUDIT_PAGE = 100;

/** Newest-first audit events for one user, optionally filtered by actor. */
export async function listRecentAudit(userId: string, options: ListAuditOptions = {}): Promise<AuditEvent[]> {
  const take = Math.min(MAX_AUDIT_PAGE, Math.max(1, Math.trunc(options.limit ?? 20)));
  return db.auditEvent.findMany({
    where: { userId, ...(options.actor ? { actor: options.actor } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}
