import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/generated/prisma/client";
import { getCampaignState, proposeVersion, STALE_VERSION_MESSAGE } from "@/lib/campaign";
import type { CampaignRules } from "@/lib/types";
import { createTestUser, db, resetDb } from "@/test/db";

const { getSessionUserId, revalidatePath } = vi.hoisted(() => ({ getSessionUserId: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/current-user", () => ({ getSessionUserId }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { approveRulesAction, saveRulesAction, setCampaignStatusAction } = await import("./actions");

/** What the Approve form posts: the hidden versionId of the displayed summary and the rules it shows. */
function approveForm(versionId: string | null, rules: CampaignRules | string): FormData {
  const form = new FormData();
  form.set("versionId", versionId ?? "");
  form.set("rules", typeof rules === "string" ? rules : JSON.stringify(rules));
  return form;
}

async function setup(): Promise<{ user: User; rules: CampaignRules }> {
  const user = await createTestUser();
  const resume = await db.resume.create({ data: { userId: user.id, filename: "r.pdf", storageKey: "k", isDefault: true } });
  getSessionUserId.mockResolvedValue(user.id);
  const rules: CampaignRules = {
    roles: ["intern"],
    autoCompanies: ["Stripe"],
    askFirstCompanies: [],
    resumeId: resume.id,
    weeklyCap: 5,
    minMatch: 75,
    endsOn: "2099-12-31",
  };
  return { user, rules };
}

describe("campaign actions", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("refuses without a session and rejects a malformed form", async () => {
    getSessionUserId.mockResolvedValue(null);
    expect(await approveRulesAction(approveForm(null, "{}"))).toEqual({ ok: false, message: "Your session ended. Sign in again." });
    await setup();
    expect(await approveRulesAction(approveForm(null, "not json"))).toEqual({
      ok: false,
      message: "We couldn't read those rules. Reload the page and try again.",
    });
    expect(await db.campaignVersion.count()).toBe(0);
  });

  it("approves exactly the displayed pending version named by the hidden versionId", async () => {
    const { user, rules } = await setup();
    const shown = await proposeVersion(user.id, rules, "muse");
    expect(await approveRulesAction(approveForm(shown.id, rules))).toEqual({ ok: true, message: "Campaign approved" });
    const state = await getCampaignState(user.id);
    expect(state.inForce?.id).toBe(shown.id);
    expect(state.inForce?.approvedVia).toBe("web");
    expect(await db.campaignVersion.count()).toBe(1);
  });

  it("refuses a displayed version that was replaced after the page loaded, approving nothing", async () => {
    const { user, rules } = await setup();
    const shown = await proposeVersion(user.id, rules, "web");
    const latest = await proposeVersion(user.id, { ...rules, weeklyCap: 9 }, "muse");
    expect(await approveRulesAction(approveForm(shown.id, rules))).toEqual({ ok: false, message: STALE_VERSION_MESSAGE });
    const state = await getCampaignState(user.id);
    expect(state.inForce).toBeNull();
    expect(state.pending?.id).toBe(latest.id);
    // The page is refreshed so the latest summary shows.
    expect(revalidatePath).toHaveBeenCalledWith("/campaign");
  });

  it("with unsaved edits, saves them as a new version and approves that one", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveRulesAction(approveForm(v1.id, rules));
    const shown = await proposeVersion(user.id, { ...rules, weeklyCap: 3 }, "muse");
    const edited = { ...rules, weeklyCap: 4 };
    expect(await approveRulesAction(approveForm(shown.id, edited))).toEqual({ ok: true, message: "New rules approved" });
    const state = await getCampaignState(user.id);
    expect(state.rulesInForce).toEqual(edited);
    expect(state.inForce?.id).not.toBe(shown.id);
    expect(state.pending).toBeNull();
    expect(await db.campaignVersion.findUniqueOrThrow({ where: { id: shown.id } })).toMatchObject({ approvedAt: null, rules: { weeklyCap: 3 } });
  });

  it("approves a first campaign with no stored version, and says nothing changed for the rules in force", async () => {
    const { user, rules } = await setup();
    expect(await approveRulesAction(approveForm(null, rules))).toEqual({ ok: true, message: "Campaign approved" });
    expect((await getCampaignState(user.id)).rulesInForce).toEqual(rules);
    const nothing = { ok: true, message: "Nothing changed. These rules are already in force." };
    expect(await approveRulesAction(approveForm(null, rules))).toEqual(nothing);
    expect(await saveRulesAction(rules)).toEqual(nothing);
    expect(await db.campaignVersion.count()).toBe(1);
  });

  it("saving the rules in force while changes are pending withdraws the pending version", async () => {
    const { user, rules } = await setup();
    await approveRulesAction(approveForm(null, rules));
    const pending = await proposeVersion(user.id, { ...rules, weeklyCap: 8 }, "web");
    vi.clearAllMocks();
    const withdrawn = { ok: true, message: "Pending changes dropped. Your approved rules stay in force." };
    expect(await saveRulesAction(rules)).toEqual(withdrawn);
    expect((await getCampaignState(user.id)).pending).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/campaign");

    const again = await proposeVersion(user.id, { ...rules, weeklyCap: 9 }, "web");
    expect(await approveRulesAction(approveForm(again.id, rules))).toEqual(withdrawn);
    const state = await getCampaignState(user.id);
    expect(state.pending).toBeNull();
    expect(state.rulesInForce).toEqual(rules);
    expect(await db.campaignVersion.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ approvedAt: null });
  });

  it("does not approve another user's version id", async () => {
    const { rules } = await setup();
    const other = await createTestUser();
    const theirResume = await db.resume.create({ data: { userId: other.id, filename: "o.pdf", storageKey: "o" } });
    const theirs = await proposeVersion(other.id, { ...rules, resumeId: theirResume.id }, "web");
    const result = await approveRulesAction(approveForm(theirs.id, { ...rules, resumeId: theirResume.id }));
    expect(result).toEqual({ ok: false, message: "Pick one of your own resumes." });
    expect(await db.campaignVersion.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ approvedAt: null });
  });

  it("saves edits as a pending version without approving them", async () => {
    const { user, rules } = await setup();
    expect(await saveRulesAction(rules)).toEqual({ ok: true, message: "Saved. These rules aren't in force until you approve them." });
    const state = await getCampaignState(user.id);
    expect(state.inForce).toBeNull();
    expect(state.pending).not.toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/campaign");
    expect(await saveRulesAction({ ...rules, weeklyCap: 0 })).toMatchObject({ ok: false });
  });

  it("pauses, resumes and revokes the campaign, auditing each change", async () => {
    const { user, rules } = await setup();
    expect(await setCampaignStatusAction("paused")).toMatchObject({ ok: false });
    await approveRulesAction(approveForm(null, rules));

    expect(await setCampaignStatusAction("paused")).toEqual({ ok: true, message: "Campaign paused. Nothing goes out until you resume." });
    expect((await getCampaignState(user.id)).campaign?.status).toBe("paused");
    expect(await setCampaignStatusAction("active")).toEqual({ ok: true, message: "Campaign resumed" });
    expect((await getCampaignState(user.id)).campaign?.status).toBe("active");
    expect(await setCampaignStatusAction("revoked")).toEqual({
      ok: true,
      message: "Campaign revoked. Inroad will ask before every application.",
    });
    expect(await db.campaign.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({ status: "revoked" });
    const events = await db.auditEvent.findMany({
      where: { userId: user.id, action: { in: ["campaign.paused", "campaign.resumed", "campaign.revoked"] } },
    });
    expect(events.map((e) => e.action).sort()).toEqual(["campaign.paused", "campaign.resumed", "campaign.revoked"]);
  });

  it("refuses an unknown status or a signed-out user", async () => {
    await setup();
    expect(await setCampaignStatusAction("deleted")).toEqual({ ok: false, message: "Unknown campaign action." });
    getSessionUserId.mockResolvedValue(null);
    expect(await setCampaignStatusAction("paused")).toEqual({ ok: false, message: "Your session ended. Sign in again." });
    expect(await saveRulesAction({})).toEqual({ ok: false, message: "Your session ended. Sign in again." });
  });
});
