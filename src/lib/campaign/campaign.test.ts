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
  proposeRules,
  proposeVersion,
  setCampaignStatus,
  STALE_VERSION_MESSAGE,
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

  it("a second proposal creates a new version and supersedes the earlier pending one, whose rules never change", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const first = await proposeVersion(user.id, { ...rules, weeklyCap: 3 }, "web");
    const second = await proposeVersion(user.id, { ...rules, weeklyCap: 7 }, "muse");
    expect(second.id).not.toBe(first.id);
    expect(await db.campaignVersion.count()).toBe(3);
    const replaced = await db.campaignVersion.findUniqueOrThrow({ where: { id: first.id } });
    expect(replaced.rules).toMatchObject({ weeklyCap: 3 });
    expect(replaced.supersededAt).toBeInstanceOf(Date);
    expect(replaced.approvedAt).toBeNull();
    expect((await getCampaignState(user.id)).pending?.id).toBe(second.id);
    const proposed = await db.auditEvent.findFirstOrThrow({ where: { userId: user.id, actor: "muse", action: "campaign.proposed" } });
    expect(proposed.payload).toMatchObject({ versionId: second.id, supersededVersionId: first.id, replacedPending: true });
  });

  it("refuses to approve a version a newer proposal replaced (stale_version) and approves nothing", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const shown = await proposeVersion(user.id, { ...rules, weeklyCap: 3 }, "muse");
    const latest = await proposeVersion(user.id, { ...rules, weeklyCap: 9 }, "web");
    const stale = approveVersion(user.id, shown.id, "muse");
    await expect(stale).rejects.toMatchObject({ code: "stale_version", message: STALE_VERSION_MESSAGE });
    const state = await getCampaignState(user.id);
    expect(state.inForce?.id).toBe(v1.id);
    expect(state.pending?.id).toBe(latest.id);
    expect(await db.campaignVersion.count({ where: { approvedAt: { not: null } } })).toBe(1);
    expect((await approveVersion(user.id, latest.id, "web")).rules).toMatchObject({ weeklyCap: 9 });
    await expect(approveVersion(user.id, shown.id, "web")).rejects.toMatchObject({ code: "stale_version" });
  });

  it("proposing the pending rules again returns that version unchanged, with no new audit entry", async () => {
    const { user, rules } = await setup();
    const first = await proposeRules(user.id, rules, "web");
    expect(first.outcome).toBe("created");
    const again = await proposeRules(user.id, { ...rules, autoCompanies: ["datadog", "STRIPE"] }, "muse");
    expect(again).toMatchObject({ outcome: "unchanged_pending", supersededVersionId: null });
    expect(again.version.id).toBe(first.version.id);
    expect(again.version.supersededAt).toBeNull();
    expect(await db.campaignVersion.count()).toBe(1);
    expect(await auditActions(user.id)).toEqual(["campaign.proposed"]);
  });

  it("proposing the rules in force with nothing pending is a no-op returning the version in force", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const result = await proposeRules(user.id, rules, "muse");
    expect(result.outcome).toBe("unchanged_in_force");
    expect(result.version.id).toBe(v1.id);
    expect(await db.campaignVersion.count()).toBe(1);
    expect((await getCampaignState(user.id)).pending).toBeNull();
    expect(await auditActions(user.id)).toEqual(["campaign.proposed", "campaign.approved"]);
  });

  it("reverting to the rules in force while a version is pending withdraws the pending version", async () => {
    const { user, rules } = await setup();
    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const v2 = await proposeVersion(user.id, { ...rules, weeklyCap: 8 }, "web");

    const result = await proposeRules(user.id, { ...rules, autoCompanies: ["datadog", "stripe"] }, "muse");
    expect(result).toMatchObject({ outcome: "withdrawn_pending", supersededVersionId: v2.id });
    expect(result.version.id).toBe(v1.id);
    expect(await db.campaignVersion.count()).toBe(2);
    const state = await getCampaignState(user.id);
    expect(state.pending).toBeNull();
    expect(state.inForce?.id).toBe(v1.id);
    expect((await db.campaignVersion.findUniqueOrThrow({ where: { id: v2.id } })).supersededAt).not.toBeNull();
    await expect(approveVersion(user.id, v2.id, "muse")).rejects.toMatchObject({ code: "stale_version" });

    expect(await auditActions(user.id)).toEqual([
      "campaign.proposed",
      "campaign.approved",
      "campaign.proposed",
      "campaign.proposal_withdrawn",
    ]);
    const withdrawn = await db.auditEvent.findFirstOrThrow({ where: { action: "campaign.proposal_withdrawn" } });
    expect(withdrawn).toMatchObject({ actor: "muse" });
    expect(withdrawn.payload).toMatchObject({
      campaignId: v1.campaignId,
      versionId: v2.id,
      inForceVersionId: v1.id,
      via: "muse",
      withdrawn: { ...rules, weeklyCap: 8 },
    });
  });

  it("withdraws a pending version by saving the rules in force even after their end date has passed", async () => {
    const { user, rules } = await setup();
    const ending = { ...rules, endsOn: "2026-11-10" };
    const proposedAt = new Date("2026-11-07T12:00:00Z");
    const v1 = await proposeVersion(user.id, ending, "web", proposedAt);
    await approveVersion(user.id, v1.id, "web", proposedAt);
    const v2 = await proposeVersion(user.id, { ...ending, endsOn: FAR_FUTURE }, "web", proposedAt);

    const afterEnd = new Date("2026-11-20T12:00:00Z");
    const result = await proposeRules(user.id, ending, "web", afterEnd);
    expect(result).toMatchObject({ outcome: "withdrawn_pending", supersededVersionId: v2.id });
    expect(result.version.id).toBe(v1.id);
    expect((await getCampaignState(user.id)).pending).toBeNull();
    await expect(proposeRules(user.id, ending, "web", afterEnd)).resolves.toMatchObject({ outcome: "unchanged_in_force" });
    await expect(proposeRules(user.id, { ...ending, weeklyCap: 2 }, "web", afterEnd)).rejects.toThrow(
      "The end date has already passed.",
    );
    expect(await db.campaignVersion.count()).toBe(2);
  });

  it("refuses to approve a pending version of a revoked campaign and leaves it revoked", async () => {
    const { user, rules } = await setup();
    const neverApproved = await proposeVersion(user.id, rules, "muse");
    const first = await setCampaignStatus(user.id, "revoked");
    await expect(approveVersion(user.id, neverApproved.id, "muse")).rejects.toMatchObject({
      code: "not_found",
      message: "We couldn't find that campaign version.",
    });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("revoked");
    expect((await db.campaignVersion.findUniqueOrThrow({ where: { id: neverApproved.id } })).approvedAt).toBeNull();

    const v1 = await proposeVersion(user.id, rules, "web");
    await approveVersion(user.id, v1.id, "web");
    const v2 = await proposeVersion(user.id, { ...rules, weeklyCap: 2 }, "muse");
    const second = await setCampaignStatus(user.id, "revoked");
    await expect(approveVersion(user.id, v2.id, "muse")).rejects.toMatchObject({ code: "not_found" });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("revoked");
    expect((await db.campaignVersion.findUniqueOrThrow({ where: { id: v2.id } })).approvedAt).toBeNull();
    expect(await db.auditEvent.count({ where: { userId: user.id, action: "campaign.approved" } })).toBe(1);
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
    const v3 = await proposeVersion(user.id, { ...rules, weeklyCap: 4 }, "web");
    const history = await getCampaignHistory(user.id);
    expect(history.map((h) => [h.id, h.number, h.state, h.proposedBy])).toEqual([
      [v3.id, 3, "pending", "user"],
      [v2.id, 2, "replaced", "muse"],
      [v1.id, 1, "in_force", "user"],
    ]);
    expect(history[2]).toMatchObject({ approvedVia: "web" });
    expect(history[1]).toMatchObject({ approvedAt: null, approvedVia: null });
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
