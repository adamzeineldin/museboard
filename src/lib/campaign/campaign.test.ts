import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/generated/prisma/client";
import type { CampaignRules } from "@/lib/types";
import { createTestUser, db, resetDb } from "@/test/db";
import {
  approveVersion,
  CampaignError,
  getCampaignHistory,
  getCampaignState,
  loadRuleCampaign,
  proposeVersion,
  setCampaignStatus,
} from "./index";

const FAR_FUTURE = "2099-12-31";

async function setup(): Promise<{ user: User; rules: CampaignRules }> {
  const user = await createTestUser();
  const resume = await db.resume.create({
    data: { userId: user.id, filename: "Resume_v3.pdf", storageKey: "k", isDefault: true },
  });
  const rules: CampaignRules = {
    roles: ["intern"],
    autoCompanies: ["Stripe", "Datadog"],
    askFirstCompanies: ["Meta"],
    resumeId: resume.id,
    weeklyCap: 5,
    minMatch: 75,
    endsOn: FAR_FUTURE,
  };
  return { user, rules };
}

const auditActions = async (userId: string): Promise<string[]> =>
  (await db.auditEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((e) => e.action);

describe("campaign versions", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns an empty state for a new user", async () => {
    const { user } = await setup();
    expect(await getCampaignState(user.id)).toEqual({ campaign: null, inForce: null, pending: null, rulesInForce: null });
    expect(await getCampaignHistory(user.id)).toEqual([]);
  });

  it("proposing creates a campaign held until approved, with a pending version", async () => {
    const { user, rules } = await setup();
    const version = await proposeVersion(user.id, rules, "web");
    const state = await getCampaignState(user.id);
    expect(state.campaign?.status).toBe("paused");
    expect(state.inForce).toBeNull();
    expect(state.pending?.id).toBe(version.id);
    expect(state.rulesInForce).toBeNull();

    const [event] = await db.auditEvent.findMany({ where: { userId: user.id } });
    expect(event).toMatchObject({ actor: "user", action: "campaign.proposed" });
    expect(event.payload).toMatchObject({ versionId: version.id, via: "web", before: null, after: rules });
  });

  it("first approval puts the version in force and activates the campaign", async () => {
    const { user, rules } = await setup();
    const version = await proposeVersion(user.id, rules, "web");
    const approved = await approveVersion(user.id, version.id, "web");
    expect(approved.approvedAt).toBeInstanceOf(Date);
    expect(approved).toMatchObject({ approvedVia: "web", approvedBy: user.id });

    const state = await getCampaignState(user.id);
    expect(state.campaign?.status).toBe("active");
    expect(state.inForce?.id).toBe(version.id);
    expect(state.pending).toBeNull();
    expect(state.rulesInForce).toEqual(rules);
    expect(await auditActions(user.id)).toEqual(["campaign.proposed", "campaign.approved"]);
  });

  it("an edit creates a pending version; the approved one stays in force", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const edited = { ...rules, autoCompanies: ["Stripe"] };
    const v2 = await proposeVersion(user.id, edited, "muse");

    const state = await getCampaignState(user.id);
    expect(state.inForce?.id).toBe(v1.id);
    expect(state.pending?.id).toBe(v2.id);
    expect(state.rulesInForce?.autoCompanies).toEqual(["Stripe", "Datadog"]);

    const proposed = await db.auditEvent.findFirstOrThrow({ where: { userId: user.id, actor: "muse" } });
    expect(proposed.payload).toMatchObject({ before: rules, after: edited, replacedPending: false });
  });

  it("a second proposal replaces the rules of the existing pending version", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const first = await proposeVersion(user.id, { ...rules, weeklyCap: 3 }, "web");
    const second = await proposeVersion(user.id, { ...rules, weeklyCap: 7 }, "muse");
    expect(second.id).toBe(first.id);
    expect(await db.campaignVersion.count()).toBe(2);
    expect((await getCampaignState(user.id)).pending?.rules).toMatchObject({ weeklyCap: 7 });
  });

  it("approving the pending version swaps it in and keeps the campaign status", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    await setCampaignStatus(user.id, "paused");
    const v2 = await proposeVersion(user.id, { ...rules, weeklyCap: 2 }, "muse");
    await approveVersion(user.id, v2.id, "muse");

    const state = await getCampaignState(user.id);
    expect(state.inForce?.id).toBe(v2.id);
    expect(state.campaign?.status).toBe("paused");
    const approved = await db.auditEvent.findFirstOrThrow({ where: { action: "campaign.approved", actor: "muse" } });
    expect(approved.payload).toMatchObject({ versionId: v2.id, before: rules, after: { ...rules, weeklyCap: 2 } });
  });

  it("validates rules, resume ownership and the end date", async () => {
    const { user, rules } = await setup();
    const other = await createTestUser();
    const otherResume = await db.resume.create({ data: { userId: other.id, filename: "x.pdf", storageKey: "x" } });

    await expect(proposeVersion(user.id, { ...rules, weeklyCap: 0 }, "web")).rejects.toBeInstanceOf(CampaignError);
    await expect(proposeVersion(user.id, { ...rules, resumeId: otherResume.id }, "web")).rejects.toThrow(
      "Pick one of your own resumes.",
    );
    await expect(proposeVersion(user.id, { ...rules, endsOn: "2020-01-01" }, "web")).rejects.toThrow(
      "The end date has already passed.",
    );
    await expect(
      proposeVersion(user.id, { ...rules, endsOn: "2026-11-07" }, "web", new Date("2026-11-07T23:00:00-05:00")),
    ).resolves.toBeTruthy();
    await expect(
      proposeVersion(user.id, { ...rules, endsOn: "2026-11-07" }, "web", new Date("2026-11-08T05:30:00Z")),
    ).rejects.toThrow("The end date has already passed.");
  });

  it("only approves a pending version of the user's own campaign", async () => {
    const { user, rules } = await setup();
    const other = await setup();
    const theirs = await proposeVersion(other.user.id, other.rules, "web");
    await expect(approveVersion(user.id, theirs.id, "web")).rejects.toThrow("We couldn't find that campaign version.");

    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    await expect(approveVersion(user.id, v1.id, "web")).rejects.toThrow("That version is already approved.");
  });

  it("refuses to approve a version whose end date has passed since it was proposed", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, { ...rules, endsOn: "2026-11-10" }, "web", new Date("2026-11-07T12:00:00Z"));
    await expect(approveVersion(user.id, v1.id, "web", new Date("2026-11-12T12:00:00Z"))).rejects.toThrow(
      "This version's end date has passed. Pick a new end date first.",
    );
  });

  it("pauses, resumes and revokes with valid transitions only", async () => {
    const { user, rules } = await setup();
    await expect(setCampaignStatus(user.id, "paused")).rejects.toThrow("You don't have a campaign yet.");
    const v1 = await proposeVersion(user.id, rules, "web");
    await expect(setCampaignStatus(user.id, "active")).rejects.toThrow("Approve the campaign first.");
    await approveVersion(user.id, v1.id, "web");

    expect((await setCampaignStatus(user.id, "paused")).status).toBe("paused");
    await expect(setCampaignStatus(user.id, "paused")).rejects.toThrow("The campaign is already paused.");
    expect((await setCampaignStatus(user.id, "active")).status).toBe("active");
    expect((await setCampaignStatus(user.id, "revoked")).status).toBe("revoked");

    // Revoked is terminal: the user has no live campaign any more.
    expect((await getCampaignState(user.id)).campaign).toBeNull();
    await expect(setCampaignStatus(user.id, "active")).rejects.toThrow("You don't have a campaign yet.");
    expect(await auditActions(user.id)).toEqual([
      "campaign.proposed",
      "campaign.approved",
      "campaign.paused",
      "campaign.resumed",
      "campaign.revoked",
    ]);
  });

  it("after a revoke, a new proposal starts a fresh campaign with a first version", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const revoked = await setCampaignStatus(user.id, "revoked");
    const fresh = await proposeVersion(user.id, rules, "web");
    expect(fresh.campaignId).not.toBe(revoked.id);
    expect(await db.campaign.count({ where: { userId: user.id } })).toBe(2);
  });

  it("lists version history newest first, with who proposed the pending one", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const v2 = await proposeVersion(user.id, { ...rules, weeklyCap: 3 }, "muse");
    const history = await getCampaignHistory(user.id);
    expect(history.map((h) => [h.id, h.number, h.state, h.proposedBy])).toEqual([
      [v2.id, 2, "pending", "muse"],
      [v1.id, 1, "in_force", "user"],
    ]);
    expect(history[1]).toMatchObject({ approvedVia: "web" });
  });
});

describe("loadRuleCampaign", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("builds the rule-engine view of the newest campaign, including a revoked one", async () => {
    const { user, rules } = await setup();
    expect((await loadRuleCampaign(user.id, "UTC")).ruleCampaign).toBeNull();

    const v1 = await proposeVersion(user.id, rules, "web");
    expect((await loadRuleCampaign(user.id, "UTC")).ruleCampaign).toEqual({
      status: "paused",
      inForce: null,
      timeZone: "UTC",
    });
    await approveVersion(user.id, v1.id, "web");
    const live = await loadRuleCampaign(user.id, "America/New_York");
    expect(live.ruleCampaign).toEqual({ status: "active", inForce: { rules }, timeZone: "America/New_York" });
    expect(live.versionInForce?.id).toBe(v1.id);

    await setCampaignStatus(user.id, "revoked");
    expect((await loadRuleCampaign(user.id, "UTC")).ruleCampaign?.status).toBe("revoked");
  });
});
