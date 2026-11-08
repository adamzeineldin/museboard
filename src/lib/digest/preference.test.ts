import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import { DIGEST_PREFERENCE_ACTION, setDigestEnabled } from "./preference";

const auditFailure = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    writeAudit: (...args: Parameters<typeof actual.writeAudit>) =>
      auditFailure.on ? Promise.reject(new Error("SQLITE_BUSY")) : actual.writeAudit(...args),
  };
});

const audits = (userId: string) => db.auditEvent.findMany({ where: { userId, action: DIGEST_PREFERENCE_ACTION } });

describe("setDigestEnabled", () => {
  beforeEach(resetDb);
  afterEach(() => {
    auditFailure.on = false;
  });

  it("turns the digest off and back on, auditing each change as the user", async () => {
    const user = await createTestUser();
    expect(await setDigestEnabled(user.id, false)).toEqual({ enabled: false, changed: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).digestOptOut).toBe(true);
    expect(await setDigestEnabled(user.id, true)).toEqual({ enabled: true, changed: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).digestOptOut).toBe(false);

    const events = await audits(user.id);
    expect(events.map((e) => [e.actor, e.payload])).toEqual([
      ["user", { enabled: false, via: "settings" }],
      ["user", { enabled: true, via: "settings" }],
    ]);
  });

  it("does not change the setting when its audit can't be written", async () => {
    const user = await createTestUser();
    auditFailure.on = true;
    await expect(setDigestEnabled(user.id, false)).rejects.toThrow("SQLITE_BUSY");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).digestOptOut).toBe(false);
  });

  it("is a no-op (no audit) when nothing changes", async () => {
    const user = await createTestUser();
    expect(await setDigestEnabled(user.id, true)).toEqual({ enabled: true, changed: false });
    expect(await audits(user.id)).toHaveLength(0);
  });

  it("rejects an unknown user and a non-boolean value", async () => {
    await expect(setDigestEnabled("nobody", false)).rejects.toThrow("We couldn't find your account.");
    const user = await createTestUser();
    await expect(setDigestEnabled(user.id, "yes" as unknown as boolean)).rejects.toThrow();
  });
});
