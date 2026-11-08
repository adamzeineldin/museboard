import { describe, expect, it } from "vitest";
import { LINK_TOKEN_TTL_MS, MAX_TOKEN_LENGTH, signLinkToken, verifyLinkToken } from "./tokens";

const SECRET = "test-secret-0123456789abcdef";
const NOW = new Date("2026-11-09T13:00:00Z");
const pauseToken = (now = NOW, secret = SECRET) =>
  signLinkToken({ purpose: "pause", userId: "user_1", campaignId: "camp_1" }, secret, now);

const decode = (token: string) => JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"));

describe("signLinkToken", () => {
  it("signs the purpose, user, campaign and a 14-day expiry as base64url", () => {
    const token = pauseToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(decode(token)).toEqual({
      v: 1,
      purpose: "pause",
      userId: "user_1",
      campaignId: "camp_1",
      exp: Math.floor((NOW.getTime() + LINK_TOKEN_TTL_MS) / 1000),
    });
  });

  it("omits campaignId for unsubscribe links and refuses an empty secret or user", () => {
    expect(decode(signLinkToken({ purpose: "unsubscribe", userId: "u" }, SECRET, NOW))).not.toHaveProperty("campaignId");
    expect(() => signLinkToken({ purpose: "pause", userId: "u" }, "", NOW)).toThrow(/secret/);
    expect(() => signLinkToken({ purpose: "pause", userId: " " }, SECRET, NOW)).toThrow();
  });
});

describe("verifyLinkToken", () => {
  it("accepts a fresh token for the same purpose", () => {
    const result = verifyLinkToken(pauseToken(), "pause", SECRET, new Date(NOW.getTime() + 1000));
    expect(result).toEqual({ ok: true, claims: expect.objectContaining({ userId: "user_1", campaignId: "camp_1" }) });
  });

  it("rejects the wrong purpose (a pause link can't unsubscribe, and the reverse)", () => {
    expect(verifyLinkToken(pauseToken(), "unsubscribe", SECRET, NOW)).toEqual({ ok: false, reason: "wrong_purpose" });
    const unsub = signLinkToken({ purpose: "unsubscribe", userId: "u" }, SECRET, NOW);
    expect(verifyLinkToken(unsub, "pause", SECRET, NOW)).toEqual({ ok: false, reason: "wrong_purpose" });
  });

  it("expires after 14 days", () => {
    const token = pauseToken();
    expect(verifyLinkToken(token, "pause", SECRET, new Date(NOW.getTime() + LINK_TOKEN_TTL_MS - 1000)).ok).toBe(true);
    expect(verifyLinkToken(token, "pause", SECRET, new Date(NOW.getTime() + LINK_TOKEN_TTL_MS))).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects tampered claims, a swapped signature and another secret", () => {
    const token = pauseToken();
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...decode(token), userId: "someone_else" })).toString("base64url");
    expect(verifyLinkToken(`${forged}.${sig}`, "pause", SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    const other = signLinkToken({ purpose: "pause", userId: "user_2", campaignId: "camp_1" }, SECRET, NOW);
    expect(verifyLinkToken(`${token.split(".")[0]}.${other.split(".")[1]}`, "pause", SECRET, NOW).ok).toBe(false);
    expect(verifyLinkToken(token, "pause", "a-different-secret-entirely", NOW)).toEqual({ ok: false, reason: "bad_signature" });
    const flipped = `${token.slice(0, -2)}${token.endsWith("A") ? "B" : "A"}${token.slice(-1)}`;
    expect(verifyLinkToken(flipped, "pause", SECRET, NOW).ok).toBe(false);
  });

  it.each([
    ["non-string", 42],
    ["empty", ""],
    ["no dot", "abc"],
    ["three parts", "a.b.c"],
    ["bad alphabet", "a+b.c/d"],
    ["short signature", "abc.def"],
    ["too long", `${"a".repeat(MAX_TOKEN_LENGTH)}.b`],
  ])("rejects a malformed token (%s)", (_label, token) => {
    expect(verifyLinkToken(token, "pause", SECRET, NOW).ok).toBe(false);
  });

  it("rejects a correctly signed body that isn't valid claims", async () => {
    const { createHmac } = await import("node:crypto");
    const body = Buffer.from(JSON.stringify({ v: 2, purpose: "pause", userId: "u", exp: 9e9 })).toString("base64url");
    const key = createHmac("sha256", SECRET).update("inroad:digest-link:v1").digest();
    const sig = createHmac("sha256", key).update(body).digest("base64url");
    expect(verifyLinkToken(`${body}.${sig}`, "pause", SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
  });
});
