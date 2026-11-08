import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_DIGEST_STATE } from "@/components/digest/digest-toggle-state";
import { createTestUser, db, resetDb } from "@/test/db";

const { getSessionUserId, revalidatePath } = vi.hoisted(() => ({ getSessionUserId: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ getSessionUserId }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { setDigestPreferenceAction } = await import("./digest-actions");

const form = (digest: string): FormData => {
  const data = new FormData();
  data.append("digest", digest);
  return data;
};

describe("setDigestPreferenceAction", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it("turns the digest off and on for the session user, with an audit entry", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    expect(await setDigestPreferenceAction(IDLE_DIGEST_STATE, form("off"))).toMatchObject({ status: "success", enabled: false });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).digestOptOut).toBe(true);
    expect(await setDigestPreferenceAction(IDLE_DIGEST_STATE, form("on"))).toMatchObject({
      status: "success",
      enabled: true,
      message: "Weekly digest is on. It arrives on Monday mornings.",
    });
    expect(await db.auditEvent.count({ where: { userId: user.id, action: "digest.preference_changed", actor: "user" } })).toBe(2);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("rejects a missing session and bad input", async () => {
    getSessionUserId.mockResolvedValue(null);
    expect(await setDigestPreferenceAction(IDLE_DIGEST_STATE, form("off"))).toMatchObject({ status: "error", message: "Your session ended. Sign in again." });
    getSessionUserId.mockResolvedValue("someone");
    expect(await setDigestPreferenceAction(IDLE_DIGEST_STATE, form("maybe"))).toMatchObject({ status: "error", message: "Choose on or off." });
    expect(await setDigestPreferenceAction(IDLE_DIGEST_STATE, form("off"))).toMatchObject({ status: "error", message: "We couldn't find your account." });
  });
});
