import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import { ConnectorError } from "./errors";
import { hashToken } from "./token-format";
import { createConnectorToken, listTokens, revokeToken, verifyBearer } from "./tokens";
import { MAX_ACTIVE_TOKENS } from "./constants";

const T0 = new Date("2026-11-02T15:00:00Z");
const later = (ms: number): Date => new Date(T0.getTime() + ms);

describe("connector tokens", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a token, returns the plaintext once and stores only its SHA-256 hash", async () => {
    const user = await createTestUser();
    const created = await createConnectorToken(user.id, "  Muse on my phone ", "write");
    expect(created.token).toMatch(/^inr_[A-Za-z0-9_-]{43}$/);
    expect(created.record).toMatchObject({ name: "Muse on my phone", scope: "write", lastUsedAt: null, revokedAt: null });
    expect(created.record).not.toHaveProperty("tokenHash");

    const row = await db.connectorToken.findUniqueOrThrow({ where: { id: created.record.id } });
    expect(row.tokenHash).toBe(hashToken(created.token));
    expect(JSON.stringify(row)).not.toContain(created.token);
  });

  it("audits create and revoke without ever logging the token or its hash", async () => {
    const user = await createTestUser();
    const { token, record } = await createConnectorToken(user.id, "Muse", "read");
    await revokeToken(user.id, record.id);
    const events = await db.auditEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => [e.actor, e.action])).toEqual([
      ["user", "connector.token_created"],
      ["user", "connector.token_revoked"],
    ]);
    expect(events[0].payload).toEqual({ tokenId: record.id, name: "Muse", scope: "read" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(hashToken(token));
  });

  it("rejects bad names and scopes with user-safe errors", async () => {
    const user = await createTestUser();
    await expect(createConnectorToken(user.id, "   ", "read")).rejects.toThrow(ConnectorError);
    await expect(createConnectorToken(user.id, "x".repeat(61), "read")).rejects.toThrow(/60 characters/);
    await expect(createConnectorToken(user.id, "Muse", "admin" as never)).rejects.toThrow(/read only or read and write/i);
    await expect(createConnectorToken("missing-user", "Muse", "read")).rejects.toThrow(/couldn't find your account/i);
  });

  it("caps the number of active tokens per user", async () => {
    const user = await createTestUser();
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i += 1) await createConnectorToken(user.id, `Token ${i}`, "read");
    await expect(createConnectorToken(user.id, "One more", "read")).rejects.toThrow(/Revoke one/);
  });

  it("verifies a bearer header to the owner and scope", async () => {
    const user = await createTestUser();
    const { token, record } = await createConnectorToken(user.id, "Muse", "write");
    expect(await verifyBearer(`Bearer ${token}`, T0)).toEqual({ userId: user.id, scope: "write", tokenId: record.id });
  });

  it("rejects missing, malformed, unknown and revoked tokens", async () => {
    const user = await createTestUser();
    const { token, record } = await createConnectorToken(user.id, "Muse", "write");
    expect(await verifyBearer(null)).toBeNull();
    expect(await verifyBearer("Bearer nope")).toBeNull();
    expect(await verifyBearer(`Bearer inr_${"A".repeat(43)}`)).toBeNull();
    await revokeToken(user.id, record.id);
    expect(await verifyBearer(`Bearer ${token}`)).toBeNull();
  });

  it("updates lastUsedAt at most once a minute", async () => {
    const user = await createTestUser();
    const { token, record } = await createConnectorToken(user.id, "Muse", "read");
    const lastUsed = async () => (await db.connectorToken.findUniqueOrThrow({ where: { id: record.id } })).lastUsedAt;

    await verifyBearer(`Bearer ${token}`, T0);
    expect(await lastUsed()).toEqual(T0);
    await verifyBearer(`Bearer ${token}`, later(30_000));
    expect(await lastUsed()).toEqual(T0);
    await verifyBearer(`Bearer ${token}`, later(61_000));
    expect(await lastUsed()).toEqual(later(61_000));
  });

  it("lists the user's own tokens newest first, without hashes", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const first = await createConnectorToken(user.id, "First", "read");
    const second = await createConnectorToken(user.id, "Second", "write");
    await createConnectorToken(other.id, "Not mine", "write");

    const tokens = await listTokens(user.id);
    expect(tokens.map((t) => t.name)).toEqual(["Second", "First"]);
    expect(tokens.map((t) => t.id)).toEqual([second.record.id, first.record.id]);
    for (const token of tokens) expect(token).not.toHaveProperty("tokenHash");
  });

  it("revokes only the owner's token; revoking twice is harmless", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const { token, record } = await createConnectorToken(owner.id, "Muse", "write");

    await expect(revokeToken(intruder.id, record.id)).rejects.toThrow(/couldn't find that connection/i);
    expect(await verifyBearer(`Bearer ${token}`)).not.toBeNull();

    const revoked = await revokeToken(owner.id, record.id);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    const again = await revokeToken(owner.id, record.id);
    expect(again.revokedAt).toEqual(revoked.revokedAt);
    expect(await db.auditEvent.count({ where: { action: "connector.token_revoked" } })).toBe(1);
  });
});
