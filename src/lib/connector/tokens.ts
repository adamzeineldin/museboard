import "server-only";
import { z } from "zod";
import type { ConnectorToken } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { CONNECTOR_SCOPES, connectorScopeSchema, type ConnectorScope } from "@/lib/types";
import { LAST_USED_RESOLUTION_MS, MAX_ACTIVE_TOKENS, TOKEN_NAME_MAX } from "./constants";
import { ConnectorError } from "./errors";
import { generateTokenPlaintext, hashesEqual, hashToken, parseBearerHeader } from "./token-format";

// Muse connector access tokens (docs/MUSE_CONNECTOR_NOTES.md "How Inroad applies this"). One token is bound
// to one user and one scope. Only a SHA-256 hash is stored; the plaintext is returned once, at creation.
// Neither the token nor its hash is ever written to logs or the audit trail.

/** A token as the app shows it: never the hash. */
export type ConnectorTokenInfo = Omit<ConnectorToken, "tokenHash" | "userId">;

export interface CreatedToken {
  /** The plaintext bearer token. Show it once; it cannot be recovered. */
  token: string;
  record: ConnectorTokenInfo;
}

export interface VerifiedToken {
  userId: string;
  scope: ConnectorScope;
  tokenId: string;
}

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give this connection a name, like “Muse on my phone”.")
    .max(TOKEN_NAME_MAX, `Keep the name under ${TOKEN_NAME_MAX} characters.`),
  scope: z.enum(CONNECTOR_SCOPES, { error: "Choose read only or read and write." }),
});

const INFO_SELECT = { id: true, name: true, scope: true, createdAt: true, lastUsedAt: true, revokedAt: true } as const;

const notFound = (): ConnectorError => new ConnectorError("not_found", "We couldn't find that connection.");

function parseCreate(name: unknown, scope: unknown): { name: string; scope: ConnectorScope } {
  const parsed = createSchema.safeParse({ name, scope });
  if (!parsed.success) {
    throw new ConnectorError("invalid_input", parsed.error.issues[0]?.message ?? "Check the connection details.");
  }
  return parsed.data;
}

export async function createConnectorToken(userId: string, name: string, scope: ConnectorScope): Promise<CreatedToken> {
  const input = parseCreate(name, scope);
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new ConnectorError("not_found", "We couldn't find your account. Sign in again.");
  const active = await db.connectorToken.count({ where: { userId, revokedAt: null } });
  if (active >= MAX_ACTIVE_TOKENS) {
    throw new ConnectorError("limit", `You have ${MAX_ACTIVE_TOKENS} active connections. Revoke one before adding another.`);
  }

  const token = generateTokenPlaintext();
  const record = await db.connectorToken.create({
    data: { userId, name: input.name, scope: input.scope, tokenHash: hashToken(token) },
    select: INFO_SELECT,
  });
  await writeAudit(userId, "user", "connector.token_created", { tokenId: record.id, name: record.name, scope: record.scope });
  return { token, record };
}

/** Record use, at most once per LAST_USED_RESOLUTION_MS (a conditional update, so concurrent calls write once). */
async function touchLastUsed(tokenId: string, now: Date): Promise<void> {
  const threshold = new Date(now.getTime() - LAST_USED_RESOLUTION_MS);
  await db.connectorToken.updateMany({
    where: { id: tokenId, revokedAt: null, OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: threshold } }] },
    data: { lastUsedAt: now },
  });
}

/**
 * Resolve an `Authorization` header to the token's owner and scope, or null for a missing, malformed,
 * unknown or revoked token. The lookup is by hash, so the plaintext is never compared directly.
 */
export async function verifyBearer(header: string | null | undefined, now: Date = new Date()): Promise<VerifiedToken | null> {
  const token = parseBearerHeader(header);
  if (!token) return null;
  const hash = hashToken(token);
  const row = await db.connectorToken.findUnique({ where: { tokenHash: hash } });
  if (!row || row.revokedAt || !hashesEqual(row.tokenHash, hash)) return null;
  const scope = connectorScopeSchema.safeParse(row.scope);
  if (!scope.success) return null;
  try {
    await touchLastUsed(row.id, now);
  } catch (error) {
    // Failing to record "last used" must not lock the user out; it is logged without the token.
    console.error("[connector] lastUsedAt update failed", { tokenId: row.id, error: error instanceof Error ? error.message : String(error) });
  }
  return { userId: row.userId, scope: scope.data, tokenId: row.id };
}

/** The user's tokens, newest first, revoked ones included (so the list shows history). */
export async function listTokens(userId: string): Promise<ConnectorTokenInfo[]> {
  return db.connectorToken.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: INFO_SELECT,
  });
}

/** Revoke one of the user's own tokens. Revoking an already revoked token returns it unchanged. */
export async function revokeToken(userId: string, tokenId: string, now: Date = new Date()): Promise<ConnectorTokenInfo> {
  if (typeof tokenId !== "string" || !tokenId.trim() || tokenId.length > 100) throw notFound();
  const { count } = await db.connectorToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: now },
  });
  const token = await db.connectorToken.findFirst({ where: { id: tokenId, userId }, select: INFO_SELECT });
  if (!token) throw notFound();
  if (count > 0) await writeAudit(userId, "user", "connector.token_revoked", { tokenId: token.id, name: token.name });
  return token;
}
