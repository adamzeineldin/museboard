import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import { DIGEST_PREFERENCE_ACTION, setDigestEnabled } from "./preference";

const audits = (userId: string) => db.auditEvent.findMany({ where: { userId, action: DIGEST_PREFERENCE_ACTION } });

describe("setDigestEnabled", () => {
  beforeEach(resetDb);

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
