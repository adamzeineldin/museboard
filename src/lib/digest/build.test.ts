import { beforeEach, describe, expect, it } from "vitest";
import { setCampaignStatus } from "@/lib/campaign";
import { db, resetDb } from "@/test/db";
import { buildDigest } from "./build";
import { verifyLinkToken } from "./tokens";
import { approvedCampaign, LINK_CONFIG, MONDAY, newDigestWorld, SECRET, seedApplication, seedReferralDraft } from "./testing/fixtures";

const ready = async (userId: string, now = MONDAY) => {
  const built = await buildDigest(userId, now, LINK_CONFIG);
  if (built.status !== "ready") throw new Error(`expected a digest, got ${built.status}: ${built.reason}`);
  return built;
};

const tokenFrom = (url: string | null): string => new URL(url ?? "https://x.test").searchParams.get("token") ?? "";

describe("buildDigest", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("reports the week that just ended in the user's zone, plus current ready and waiting items", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    // New York week: Nov 2 05:00Z .. Nov 9 05:00Z.
    await seedApplication(world, { company: "Stripe", title: "SWE Intern", status: "submitted", submittedAt: new Date("2026-11-09T04:30:00Z") });
    await seedApplication(world, { company: "Datadog", title: "Old Intern", status: "submitted", submittedAt: new Date("2026-11-02T04:59:00Z") });
    await seedApplication(world, { company: "Datadog", title: "Next Week Intern", status: "submitted", submittedAt: new Date("2026-11-09T05:00:00Z") });
    await seedApplication(world, { company: "Datadog", title: "Backend Intern", status: "prepared", decidedAt: new Date("2026-11-04T12:00:00Z") });
    await seedApplication(world, { company: "Meta", title: "SWE Intern 2027", status: "waiting", reason: "Top choice: referral first" });
    await seedApplication(world, { company: "Acme", title: "Skipped Intern", status: "skipped" });
    await seedReferralDraft(world, "Priya Shah", "Meta", new Date("2026-11-05T12:00:00Z"));
    await seedReferralDraft(world, "Old Contact", "Meta", new Date("2026-10-20T12:00:00Z"));

    const built = await ready(world.user.id);
    expect(built.to).toBe(world.user.email);
    expect(built.data.submitted.items.map((r) => r.title)).toEqual(["SWE Intern"]);
    expect(built.data.ready.items.map((r) => r.title)).toEqual(["Backend Intern"]);
    expect(built.data.waiting.items).toEqual([expect.objectContaining({ company: "Meta", reason: "Top choice: referral first" })]);
    expect(built.data.referralDrafts.items.map((d) => d.contactName)).toEqual(["Priya Shah"]);
    // weekCount for the digest week: the submitted one plus the prepared one decided that week.
    expect(built.data.campaign).toMatchObject({ kind: "active", weekCount: 2, weeklyCap: 5, endsOn: "2026-12-15" });
    expect(built.message.subject).toBe("Your Inroad week of Nov 2: 1 sent, 1 waiting on you");
    expect(built.message.text).toContain("Stripe · SWE Intern");
    expect(built.message.text).toContain("Submitted Sun, Nov 8");
  });

  it("uses Tokyo's week boundaries for a Tokyo user", async () => {
    const world = await newDigestWorld({ timezone: "Asia/Tokyo" });
    await approvedCampaign(world);
    // 04:30Z on Nov 9 is Monday 13:30 in Tokyo: next week for them.
    await seedApplication(world, { company: "Stripe", title: "SWE Intern", status: "submitted", submittedAt: new Date("2026-11-09T04:30:00Z") });
    const built = await ready(world.user.id);
    expect(built.data.submitted.total).toBe(0);
    expect(built.data.week.firstDay).toBe("2026-11-02");
  });

  it("signs a pause link for the live campaign and an unsubscribe link for the user", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    const built = await ready(world.user.id);
    expect(built.links.pause).toMatch(/^https:\/\/inroad\.test\/pause\?token=/);
    expect(verifyLinkToken(tokenFrom(built.links.pause), "pause", SECRET, MONDAY)).toMatchObject({
      ok: true,
      claims: { userId: world.user.id, campaignId: campaign.id },
    });
    expect(verifyLinkToken(tokenFrom(built.links.unsubscribe), "unsubscribe", SECRET, MONDAY)).toMatchObject({
      ok: true,
      claims: { userId: world.user.id },
    });
    expect(built.message.html).toContain(">Pause campaign</a>");
  });

  it("has no pause link once paused, but still sends when there is something to report", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    await setCampaignStatus(world.user.id, "paused");
    await seedApplication(world, { company: "Meta", title: "SWE Intern", status: "waiting", reason: "Campaign is paused" });
    const built = await ready(world.user.id);
    expect(built.data.campaign.kind).toBe("paused");
    expect(built.links.pause).toBeNull();
    expect(built.message.text).not.toContain("Pause campaign");
  });

  it("sends an active campaign's digest even in a quiet week", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    const built = await ready(world.user.id);
    expect(built.message.text).toContain("Nothing was submitted that week.");
  });

  it("marks the campaign ended after endsOn (rule engine semantics) and offers no pause", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    await seedApplication(world, { company: "Meta", title: "SWE Intern", status: "waiting", reason: "Campaign has ended" });
    const built = await ready(world.user.id, new Date("2026-12-21T13:00:00Z"));
    expect(built.data.campaign.kind).toBe("ended");
    expect(built.links.pause).toBeNull();
  });

  it("skips opted-out users, unknown users and quiet users without an active campaign", async () => {
    const optedOut = await newDigestWorld();
    await approvedCampaign(optedOut);
    await db.user.update({ where: { id: optedOut.user.id }, data: { digestOptOut: true } });
    expect(await buildDigest(optedOut.user.id, MONDAY, LINK_CONFIG)).toEqual({ status: "skipped", reason: "opted_out" });
    expect(await buildDigest("nobody", MONDAY, LINK_CONFIG)).toEqual({ status: "skipped", reason: "no_user" });

    const quiet = await newDigestWorld();
    expect(await buildDigest(quiet.user.id, MONDAY, LINK_CONFIG)).toEqual({ status: "skipped", reason: "nothing_to_report" });
    await approvedCampaign(quiet);
    await setCampaignStatus(quiet.user.id, "revoked");
    expect(await buildDigest(quiet.user.id, MONDAY, LINK_CONFIG)).toEqual({ status: "skipped", reason: "nothing_to_report" });
  });

  it("is read-only", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    const audits = await db.auditEvent.count();
    const campaign = await db.campaign.findFirstOrThrow({ where: { userId: world.user.id } });
    await ready(world.user.id);
    expect(await db.auditEvent.count()).toBe(audits);
    expect(await db.campaign.findFirstOrThrow({ where: { userId: world.user.id } })).toEqual(campaign);
  });
});
