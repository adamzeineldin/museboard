import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_TIME_ZONE_STATE } from "@/components/settings/time-zone-state";
import { createTestUser, db, resetDb } from "@/test/db";

const { requireUser, revalidatePath } = vi.hoisted(() => ({ requireUser: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ requireUser }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { updateTimeZoneAction } = await import("./profile-actions");

const form = (timezone?: string): FormData => {
  const data = new FormData();
  if (timezone !== undefined) data.append("timezone", timezone);
  return data;
};

describe("updateTimeZoneAction", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it("changes only the session user's time zone and audits it", async () => {
    const user = await createTestUser({ timezone: "UTC" });
    const other = await createTestUser({ timezone: "UTC" });
    requireUser.mockResolvedValue(user);
    const state = await updateTimeZoneAction(IDLE_TIME_ZONE_STATE, form(" America/Los_Angeles "));
    expect(state).toMatchObject({
      status: "success",
      selected: "America/Los_Angeles",
      message: "Saved. Your time zone is America/Los Angeles. Your weekly limit resets Monday at 00:00 there.",
    });
    expect(state.nonce).toBeGreaterThan(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).timezone).toBe("America/Los_Angeles");
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).timezone).toBe("UTC");
    const audits = await db.auditEvent.findMany({ where: { action: "profile.updated" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ userId: user.id, actor: "user", payload: { fields: ["timezone"], from: "UTC", to: "America/Los_Angeles" } });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("does nothing when the zone is unchanged", async () => {
    const user = await createTestUser({ timezone: "America/New_York" });
    requireUser.mockResolvedValue(user);
    const state = await updateTimeZoneAction(IDLE_TIME_ZONE_STATE, form("America/New_York"));
    expect(state).toMatchObject({ status: "success", message: "Your time zone is already America/New York. Nothing changed." });
    expect(await db.auditEvent.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("treats another spelling of the saved zone as no change", async () => {
    const user = await createTestUser({ timezone: "America/New_York" });
    requireUser.mockResolvedValue(user);
    const state = await updateTimeZoneAction(IDLE_TIME_ZONE_STATE, form("america/new_york"));
    expect(state).toMatchObject({ status: "success", selected: "America/New_York", message: "Your time zone is already America/New York. Nothing changed." });
    expect(await db.auditEvent.count()).toBe(0);
  });

  it("saves the canonical name for a lowercase zone and audits from and to", async () => {
    const user = await createTestUser({ timezone: "America/New_York" });
    requireUser.mockResolvedValue(user);
    const state = await updateTimeZoneAction(IDLE_TIME_ZONE_STATE, form("asia/tokyo"));
    expect(state).toMatchObject({ status: "success", selected: "Asia/Tokyo" });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).timezone).toBe("Asia/Tokyo");
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "profile.updated" } });
    expect(audit.payload).toEqual({ fields: ["timezone"], from: "America/New_York", to: "Asia/Tokyo" });
  });

  it("checks for no change against the stored zone, not the session copy", async () => {
    const user = await createTestUser({ timezone: "UTC" });
    await db.user.update({ where: { id: user.id }, data: { timezone: "Asia/Tokyo" } });
    requireUser.mockResolvedValue(user);
    const state = await updateTimeZoneAction(IDLE_TIME_ZONE_STATE, form("Asia/Tokyo"));
    expect(state).toMatchObject({ status: "success", message: "Your time zone is already Asia/Tokyo. Nothing changed." });
    expect(await db.auditEvent.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("audits the stored zone as from when the session copy is stale", async () => {
    const user = await createTestUser({ timezone: "UTC" });
    await db.user.update({ where: { id: user.id }, data: { timezone: "Asia/Tokyo" } });
    requireUser.mockResolvedValue(user);
    const state = await updateTimeZoneAction(IDLE_TIME_ZONE_STATE, form("Europe/Paris"));
    expect(state).toMatchObject({ status: "success", selected: "Europe/Paris" });
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "profile.updated" } });
    expect(audit.payload).toEqual({ fields: ["timezone"], from: "Asia/Tokyo", to: "Europe/Paris" });
  });

  it.each([
    ["an offset zone", form("+05:00")],
    ["an unknown zone", form("Mars/Olympus")],
    ["a missing field", form()],
  ])("rejects %s and leaves the row alone", async (_label, data) => {
    const user = await createTestUser({ timezone: "America/New_York" });
    requireUser.mockResolvedValue(user);
    const state = await updateTimeZoneAction(IDLE_TIME_ZONE_STATE, data);
    expect(state).toMatchObject({ status: "error", message: "Pick a time zone from the list.", selected: null });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).timezone).toBe("America/New_York");
    expect(await db.auditEvent.count()).toBe(0);
  });

  it("reports a failed save without changing anything", async () => {
    const user = await createTestUser({ timezone: "America/New_York" });
    requireUser.mockResolvedValue(user);
    const tx = vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("disk full"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await updateTimeZoneAction(IDLE_TIME_ZONE_STATE, form("Asia/Tokyo"));
    expect(state).toMatchObject({
      status: "error",
      message: "We couldn't save your time zone. Nothing changed. Try again.",
      selected: "Asia/Tokyo",
    });
    expect(logged).toHaveBeenCalled();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).timezone).toBe("America/New_York");
    tx.mockRestore();
    logged.mockRestore();
  });
});
