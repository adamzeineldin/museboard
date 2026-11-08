import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCampaignStatus } from "@/lib/campaign";
import { db, resetDb } from "@/test/db";
import { LINK_MESSAGES } from "./link-outcome";
import { inspectPauseLink, pauseCampaignFromLink, PAUSED_VIA_EMAIL_ACTION } from "./pause-link";
import { approvedCampaign, MONDAY, newDigestWorld, SECRET } from "./testing/fixtures";
import { LINK_TOKEN_TTL_MS, signLinkToken } from "./tokens";
import { inspectUnsubscribeLink, unsubscribeFromLink, UNSUBSCRIBED_VIA_EMAIL_ACTION } from "./unsubscribe-link";

// Lets a test make one audit action fail, to check the state change and its audit commit together.
const auditFailure = vi.hoisted(() => ({ actions: new Set<string>() }));
vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    writeAudit: (...args: Parameters<typeof actual.writeAudit>) =>
      auditFailure.actions.has(args[2]) ? Promise.reject(new Error("SQLITE_BUSY")) : actual.writeAudit(...args),
  };
});

const LATER = new Date(MONDAY.getTime() + 60_000);
const pauseToken = (userId: string, campaignId: string, at = MONDAY) => signLinkToken({ purpose: "pause", userId, campaignId }, SECRET, at);
const unsubToken = (userId: string, at = MONDAY) => signLinkToken({ purpose: "unsubscribe", userId }, SECRET, at);
const audits = (userId: string, action: string) => db.auditEvent.findMany({ where: { userId, action } });

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  auditFailure.actions.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("pause link", () => {
  it("inspecting (GET) shows the button and changes nothing", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    const before = await db.auditEvent.count();
    const outcome = await inspectPauseLink(pauseToken(world.user.id, campaign.id), LATER);
    expect(outcome.status).toBe("ready");
    expect(outcome.message).toMatch(/stops Inroad from preparing new applications/);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("active");
    expect(await db.auditEvent.count()).toBe(before);
  });

  it("pausing (POST) pauses the campaign and audits campaign.paused_via_email as the user", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    const outcome = await pauseCampaignFromLink(pauseToken(world.user.id, campaign.id), LATER);
    expect(outcome).toEqual({ status: "done", message: expect.stringMatching(/^Your campaign is paused/) });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("paused");
    expect(await audits(world.user.id, PAUSED_VIA_EMAIL_ACTION)).toEqual([
      expect.objectContaining({ actor: "user", payload: { campaignId: campaign.id, via: "digest_email" } }),
    ]);
    expect(await audits(world.user.id, "campaign.paused")).toHaveLength(1);
  });

  it("reports done when the pause committed even if the extra email audit fails", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    auditFailure.actions.add(PAUSED_VIA_EMAIL_ACTION);
    const outcome = await pauseCampaignFromLink(pauseToken(world.user.id, campaign.id), LATER);
    expect(outcome.status).toBe("done");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("paused");
    expect(await audits(world.user.id, "campaign.paused")).toHaveLength(1);
  });

  it("is idempotent: a second click reports already paused and writes nothing", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    const token = pauseToken(world.user.id, campaign.id);
    await pauseCampaignFromLink(token, LATER);
    const count = await db.auditEvent.count();
    expect((await pauseCampaignFromLink(token, LATER)).status).toBe("already");
    expect((await inspectPauseLink(token, LATER)).status).toBe("already");
    expect(await db.auditEvent.count()).toBe(count);
  });

  it("does nothing for a revoked campaign or a link to an earlier campaign", async () => {
    const world = await newDigestWorld();
    const first = await approvedCampaign(world);
    await setCampaignStatus(world.user.id, "revoked");
    expect((await pauseCampaignFromLink(pauseToken(world.user.id, first.id), LATER)).status).toBe("not_applicable");

    const second = await approvedCampaign(world);
    expect((await pauseCampaignFromLink(pauseToken(world.user.id, first.id), LATER)).status).toBe("not_applicable");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("active");
    expect(await audits(world.user.id, PAUSED_VIA_EMAIL_ACTION)).toHaveLength(0);
  });

  it("rejects expired, tampered, wrong-purpose and missing tokens without touching the campaign", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    const token = pauseToken(world.user.id, campaign.id);
    expect(await pauseCampaignFromLink(token, new Date(MONDAY.getTime() + LINK_TOKEN_TTL_MS))).toEqual({
      status: "expired",
      message: LINK_MESSAGES.expired,
    });
    expect((await pauseCampaignFromLink(`${token}x`, LATER)).status).toBe("invalid");
    expect((await pauseCampaignFromLink(unsubToken(world.user.id), LATER)).status).toBe("invalid");
    expect((await pauseCampaignFromLink(undefined, LATER)).status).toBe("invalid");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("active");
  });

  it("fails closed with a safe message when AUTH_SECRET is missing", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    vi.stubEnv("AUTH_SECRET", "");
    expect(await pauseCampaignFromLink(pauseToken(world.user.id, campaign.id), LATER)).toEqual({ status: "error", message: LINK_MESSAGES.error });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("active");
  });
});

describe("unsubscribe link", () => {
  it("inspecting (GET) changes nothing; the POST sets digestOptOut and audits it", async () => {
    const world = await newDigestWorld();
    const token = unsubToken(world.user.id);
    expect((await inspectUnsubscribeLink(token, LATER)).status).toBe("ready");
    expect((await db.user.findUniqueOrThrow({ where: { id: world.user.id } })).digestOptOut).toBe(false);
    expect(await db.auditEvent.count()).toBe(0);

    expect((await unsubscribeFromLink(token, LATER)).status).toBe("done");
    expect((await db.user.findUniqueOrThrow({ where: { id: world.user.id } })).digestOptOut).toBe(true);
    expect(await audits(world.user.id, UNSUBSCRIBED_VIA_EMAIL_ACTION)).toEqual([
      expect.objectContaining({ actor: "user", payload: { via: "digest_email" } }),
    ]);

    expect((await unsubscribeFromLink(token, LATER)).status).toBe("already");
    expect((await inspectUnsubscribeLink(token, LATER)).status).toBe("already");
    expect(await audits(world.user.id, UNSUBSCRIBED_VIA_EMAIL_ACTION)).toHaveLength(1);
  });

  it("leaves the digest on and says nothing changed when the audit can't be written", async () => {
    const world = await newDigestWorld();
    auditFailure.actions.add(UNSUBSCRIBED_VIA_EMAIL_ACTION);
    expect(await unsubscribeFromLink(unsubToken(world.user.id), LATER)).toEqual({ status: "error", message: LINK_MESSAGES.error });
    expect((await db.user.findUniqueOrThrow({ where: { id: world.user.id } })).digestOptOut).toBe(false);

    auditFailure.actions.clear();
    expect((await unsubscribeFromLink(unsubToken(world.user.id), LATER)).status).toBe("done");
  });

  it("rejects pause tokens, expired tokens and deleted users", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    expect((await unsubscribeFromLink(pauseToken(world.user.id, campaign.id), LATER)).status).toBe("invalid");
    expect((await unsubscribeFromLink(unsubToken(world.user.id), new Date(MONDAY.getTime() + LINK_TOKEN_TTL_MS))).status).toBe("expired");
    expect((await unsubscribeFromLink(unsubToken("deleted-user"), LATER)).status).toBe("not_applicable");
    expect((await db.user.findUniqueOrThrow({ where: { id: world.user.id } })).digestOptOut).toBe(false);
  });
});
