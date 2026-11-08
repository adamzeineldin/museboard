import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Signed one-click links for the digest email (pause the campaign, stop the emails).
// Token = base64url(JSON claims) "." base64url(HMAC-SHA256(key, claims part)). The key is derived from
// AUTH_SECRET with a fixed label, so these MACs can never collide with anything Auth.js signs.
// Pure: the secret and clock are passed in.

export const LINK_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_TOKEN_LENGTH = 1024;
const KEY_LABEL = "inroad:digest-link:v1";
const MAC_BYTES = 32;

export const LINK_PURPOSES = ["pause", "unsubscribe"] as const;
export type LinkPurpose = (typeof LINK_PURPOSES)[number];

const idSchema = z.string().trim().min(1).max(200);

const claimsSchema = z.strictObject({
  v: z.literal(1),
  purpose: z.enum(LINK_PURPOSES),
  userId: idSchema,
  campaignId: idSchema.optional(),
  /** Expiry, seconds since the epoch. */
  exp: z.number().int().positive(),
});

export type LinkClaims = z.infer<typeof claimsSchema>;

export interface LinkTokenInput {
  purpose: LinkPurpose;
  userId: string;
  campaignId?: string;
}

export type LinkVerifyFailure = "malformed" | "bad_signature" | "wrong_purpose" | "expired";

export type LinkVerifyResult = { ok: true; claims: LinkClaims } | { ok: false; reason: LinkVerifyFailure };

const deriveKey = (secret: string): Buffer => createHmac("sha256", secret).update(KEY_LABEL).digest();

const mac = (secret: string, body: string): Buffer => createHmac("sha256", deriveKey(secret)).update(body).digest();

function requireSecret(secret: string): void {
  if (typeof secret !== "string" || secret.length === 0) throw new Error("A signing secret is required");
}

export function signLinkToken(input: LinkTokenInput, secret: string, now: Date): string {
  requireSecret(secret);
  const claims = claimsSchema.parse({
    v: 1,
    purpose: input.purpose,
    userId: input.userId,
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    exp: Math.floor((now.getTime() + LINK_TOKEN_TTL_MS) / 1000),
  });
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${body}.${mac(secret, body).toString("base64url")}`;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function parseClaims(body: string): LinkClaims | null {
  try {
    const parsed = claimsSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Constant-time check of the MAC, then the claims, purpose and expiry (in that order). */
export function verifyLinkToken(token: unknown, purpose: LinkPurpose, secret: string, now: Date): LinkVerifyResult {
  requireSecret(secret);
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((part) => BASE64URL.test(part))) return { ok: false, reason: "malformed" };
  const [body, signature] = parts as [string, string];

  const given = Buffer.from(signature, "base64url");
  const expected = mac(secret, body);
  // Compare equal-length buffers only; a wrong length is a forgery attempt, answered the same way.
  const lengthOk = given.length === MAC_BYTES;
  const matches = timingSafeEqual(lengthOk ? given : expected, expected) && lengthOk;
  if (!matches) return { ok: false, reason: "bad_signature" };

  const claims = parseClaims(body);
  if (!claims) return { ok: false, reason: "malformed" };
  if (claims.purpose !== purpose) return { ok: false, reason: "wrong_purpose" };
  if (claims.exp * 1000 <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}
