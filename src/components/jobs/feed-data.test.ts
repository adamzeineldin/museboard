import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";

const { loadRuleCampaign, weekCount, contactsByCompany } = vi.hoisted(() => ({
  loadRuleCampaign: vi.fn(),
  weekCount: vi.fn(),
  contactsByCompany: vi.fn(),
}));
vi.mock("@/lib/campaign", () => ({ loadRuleCampaign }));
vi.mock("@/lib/applications", () => ({ weekCount }));
vi.mock("@/lib/outreach", () => ({ contactsByCompany }));

import { loadJobsFeed } from "./feed-data";

const NOW = new Date("2026-11-07T12:00:00Z");
const RULES = { roles: ["intern"], autoCompanies: ["Stripe"], askFirstCompanies: ["Meta"], weeklyCap: 5, minMatch: 75, endsOn: "2026-12-15" };

async function seed() {
  const user = await createTestUser();
  const stripe = await db.company.create({ data: { name: "Stripe", ats: "greenhouse" } });
  const meta = await db.company.create({ data: { name: "Meta", ats: null } });
  const base = { location: "NYC", type: "intern", url: "https://x", source: "Greenhouse feed", firstSeenAt: new Date("2026-11-06T12:00:00Z") };
  await db.job.create({ data: { ...base, id: "s1", companyId: stripe.id, title: "SWE Intern" } });
  await db.job.create({ data: { ...base, id: "m1", companyId: meta.id, title: "SWE Intern" } });
  await db.job.create({ data: { ...base, id: "s-closed", companyId: stripe.id, title: "Old", closedAt: new Date() } });
  return { user, stripe, meta };
}

describe("loadJobsFeed", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    loadRuleCampaign.mockResolvedValue({ ruleCampaign: { status: "active", inForce: { rules: RULES }, timeZone: "America/New_York" } });
    weekCount.mockResolvedValue(0);
    contactsByCompany.mockResolvedValue(new Map());
  });

  it("shows open jobs only, with scores, skills, chips and warm paths, loading rules once", async () => {
    const { user, meta } = await seed();
    await db.resume.create({ data: { userId: user.id, filename: "Resume_v3.pdf", storageKey: "k", isDefault: true } });
    await db.match.create({ data: { userId: user.id, jobId: "s1", score: 90, reasons: { skills: ["Go"], similarity: 0.4 } } });
    await db.match.create({ data: { userId: user.id, jobId: "m1", score: 80, reasons: "garbage" } });
    contactsByCompany.mockResolvedValue(new Map([[meta.id, [{ id: "c1", name: "Priya Shah", companyId: meta.id }]]]));

    const feed = await loadJobsFeed({ id: user.id, timezone: "America/New_York" }, { filter: "recommended", limit: 50, now: NOW });
    expect(feed.cards.map((c) => c.id)).toEqual(["s1", "m1"]);
    expect(feed.cards[0]).toMatchObject({ score: 90, skills: ["Go"], chip: { tone: "ok", label: "Will auto-apply" } });
    expect(feed.cards[1]).toMatchObject({ skills: [], chip: { tone: "warm" }, warmPath: { label: "Priya Shah works here" } });
    expect(feed.resume).toMatchObject({ filename: "Resume_v3.pdf" });
    expect(feed.newMatchCount).toBe(2);
    expect(loadRuleCampaign).toHaveBeenCalledTimes(1);
    expect(weekCount).toHaveBeenCalledWith(user.id, NOW, "America/New_York");
  });

  it("degrades gracefully when the rule context or contacts fail to load", async () => {
    const { user } = await seed();
    loadRuleCampaign.mockRejectedValue(new Error("boom"));
    contactsByCompany.mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const feed = await loadJobsFeed({ id: user.id, timezone: "UTC" }, { filter: "recommended", limit: 50, now: NOW });
    expect(feed.rulesAvailable).toBe(false);
    expect(feed.contactsAvailable).toBe(false);
    expect(feed.cards.every((c) => c.chip.label === "Rule check unavailable")).toBe(true);
    expect(feed.resume).toBeNull();
    expect(feed.cards.every((c) => c.score === null)).toBe(true);
    errorSpy.mockRestore();
  });

  it("does not show another user's matches or applications", async () => {
    const { user } = await seed();
    const other = await createTestUser();
    await db.match.create({ data: { userId: other.id, jobId: "s1", score: 99, reasons: {} } });
    const feed = await loadJobsFeed({ id: user.id, timezone: "UTC" }, { filter: "recommended", limit: 50, now: NOW });
    expect(feed.cards.find((c) => c.id === "s1")?.score).toBeNull();
  });
});
