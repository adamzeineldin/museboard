import { describe, expect, it } from "vitest";
import { generateTokenPlaintext, hashToken, hashesEqual, parseBearerHeader, TOKEN_PATTERN } from "./token-format";

describe("generateTokenPlaintext", () => {
  it('is "inr_" plus 32 random bytes in base64url', () => {
    const token = generateTokenPlaintext();
    expect(token).toMatch(/^inr_[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token.slice(4), "base64url")).toHaveLength(32);
    expect(TOKEN_PATTERN.test(token)).toBe(true);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateTokenPlaintext()));
    expect(tokens.size).toBe(200);
  });
});

describe("hashToken", () => {
  it("is a stable SHA-256 hex digest that does not contain the token", () => {
    const token = generateTokenPlaintext();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token.slice(4, 20));
    expect(hashToken(generateTokenPlaintext())).not.toBe(hash);
  });
});

describe("hashesEqual", () => {
  it("compares digests in constant time and rejects different lengths", () => {
    const hash = hashToken(generateTokenPlaintext());
    expect(hashesEqual(hash, hash)).toBe(true);
    expect(hashesEqual(hash, hashToken(generateTokenPlaintext()))).toBe(false);
    expect(hashesEqual(hash, hash.slice(2))).toBe(false);
  });
});

describe("parseBearerHeader", () => {
  const token = generateTokenPlaintext();

  it.each([`Bearer ${token}`, `bearer ${token}`, `BEARER   ${token}  `])("accepts %s", (header) => {
    expect(parseBearerHeader(header)).toBe(token);
  });

  it.each([
    null,
    undefined,
    "",
    "Bearer",
    `Basic ${token}`,
    `Bearer ${token} extra`,
    `Bearer ${token.slice(0, -1)}`,
    `Bearer ${token}!`,
    `Bearer xyz_${token.slice(4)}`,
    `Bearer ${"a".repeat(5000)}`,
  ])("rejects %s", (header) => {
    expect(parseBearerHeader(header)).toBeNull();
  });
});
