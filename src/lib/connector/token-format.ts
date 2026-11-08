import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { TOKEN_PREFIX, TOKEN_RANDOM_BYTES } from "./constants";

// Pure helpers for connector bearer tokens: generation, hashing and header parsing. No DB access.

/** "inr_" + 32 random bytes in base64url (43 characters, no padding). */
export const TOKEN_PATTERN = /^inr_[A-Za-z0-9_-]{43}$/;
const MAX_HEADER_LENGTH = 512;
const BEARER = /^bearer\s+(\S+)\s*$/i;

export function generateTokenPlaintext(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES).toString("base64url")}`;
}

/** SHA-256 hex digest. Only this is stored; the plaintext is shown to the user once. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The token from an `Authorization: Bearer <token>` header, or null when it is missing or malformed. */
export function parseBearerHeader(header: string | null | undefined): string | null {
  if (!header || header.length > MAX_HEADER_LENGTH) return null;
  const match = BEARER.exec(header.trim());
  const token = match?.[1];
  return token && TOKEN_PATTERN.test(token) ? token : null;
}
