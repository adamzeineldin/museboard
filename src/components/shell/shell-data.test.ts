import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";

const weekCount = vi.fn();
vi.mock("@/lib/applications", () => ({ weekCount: (...args: unknown[]) => weekCount(...args) }));

const { getShellData } = await import("./shell-data");

const rules = {
  roles: ["intern"],
  autoCompanies: ["Stripe"],
  askFirstCompanies: ["Meta"],
  resumeId: "res_1",
  weeklyCap: 5,
  minMatch: 75,
  endsOn: "2026-12-15",
};

describe("getShellData", () => {
  beforeEach(async () => {
    await resetDb();
    weekCount.mockReset();
    weekCount.mockResolvedValue(2);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("handles a brand-new user with no campaign, applications or Muse activity", async () => {
    const user = await createTestUser();
    expect(await getShellData(user.id, "UTC")).toEqual({
      waitingCount: 0,
      campaign: null,
      museEvents: [],
      museConnected: false,
    });
  });

  it("ignores a campaign whose only version is not approved yet", async () => {
    const user = await createTestUser();
    await db.campaign.create({ data: { userId: user.id, versions: { create: { rules } } } });
    expect((await getShellData(user.id, "UTC")).campaign).toBeNull();
  });

  it("uses the approved version even when a newer pending version exists", async () => {
    const user = await createTestUser();
    const campaign = await db.campaign.create({ data: { userId: user.id, status: "paused" } });
    await db.campaignVersion.create({
      data: { campaignId: campaign.id, rules, approvedAt: new Date(), approvedVia: "web", createdAt: new Date("2026-11-01T00:00:00Z") },
    });
    await db.campaignVersion.create({
      data: { campaignId: campaign.id, rules: { ...rules, weeklyCap: 9 }, createdAt: new Date("2026-11-02T00:00:00Z") },
    });
    const now = new Date("2026-11-07T12:00:00Z");
    const data = await getShellData(user.id, "America/New_York", now);
    expect(data.campaign).toEqual({ status: "paused", weeklyCap: 5, endsOn: "2026-12-15", weekCount: 2 });
    expect(weekCount).toHaveBeenCalledWith(user.id, now, "America/New_York");
  });

  it("shows an unknown week count (and logs) when weekCount fails", async () => {
    const user = await createTestUser();
    weekCount.mockRejectedValue(new Error("not implemented: weekCount"));
    await db.campaign.create({
      data: { userId: user.id, versions: { create: { rules, approvedAt: new Date(), approvedVia: "muse" } } },
    });
    expect((await getShellData(user.id, "UTC")).campaign).toMatchObject({ status: "active", weekCount: null });
    expect(console.error).toHaveBeenCalled();
  });

  it("ignores revoked campaigns", async () => {
    const user = await createTestUser();
    await db.campaign.create({
      data: { userId: user.id, status: "revoked", versions: { create: { rules, approvedAt: new Date(), approvedVia: "web" } } },
    });
    expect((await getShellData(user.id, "UTC")).campaign).toBeNull();
  });

  it("counts waiting applications and lists Muse events, scoped to the user", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const company = await db.company.create({ data: { name: "Stripe", ats: "greenhouse" } });
    const job = await db.job.create({
      data: { id: "greenhouse:stripe:1", companyId: company.id, title: "SWE Intern", location: "NYC", type: "intern", url: "https://x.test", source: "Greenhouse feed" },
    });
    const resume = await db.resume.create({ data: { userId: user.id, filename: "r.pdf", storageKey: "k" } });
    await db.application.create({
      data: { userId: user.id, jobId: job.id, resumeId: resume.id, status: "waiting", decidedBy: "campaign", reason: "Top choice: referral first" },
    });
    await db.auditEvent.create({ data: { userId: user.id, actor: "muse", action: "tool.find_roles", payload: { summary: "8 roles" } } });
    await db.auditEvent.create({ data: { userId: user.id, actor: "user", action: "campaign.approved", payload: {} } });
    await db.auditEvent.create({ data: { userId: other.id, actor: "muse", action: "tool.other", payload: {} } });
    await db.connectorToken.create({ data: { userId: user.id, name: "Muse", tokenHash: "h1", scope: "write" } });

    const data = await getShellData(user.id, "UTC");
    expect(data.waitingCount).toBe(1);
    expect(data.museEvents.map((e) => e.tool)).toEqual(["inroad.find_roles"]);
    expect(data.museEvents[0]?.summary).toBe("8 roles");
    expect(data.museConnected).toBe(true);
  });

  it("does not count revoked connector tokens as connected", async () => {
    const user = await createTestUser();
    await db.connectorToken.create({ data: { userId: user.id, name: "Muse", tokenHash: "h2", scope: "read", revokedAt: new Date() } });
    expect((await getShellData(user.id, "UTC")).museConnected).toBe(false);
  });
});
