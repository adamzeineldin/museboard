import { describe, expect, it } from "vitest";
import type { CampaignRules } from "@/lib/types";
import { checkApplication, RULE_REASONS, pickVersionInForce } from "./index";
import type { RuleCampaign, RuleJob, RuleMatch } from "./types";

const RULES: CampaignRules = {
  roles: ["intern"],
  autoCompanies: ["Stripe", "Datadog", "Capital One"],
  askFirstCompanies: ["Meta", "Google"],
  resumeId: "res_123",
  weeklyCap: 5,
  minMatch: 75,
  endsOn: "2026-12-15",
};

const NOW = new Date("2026-11-07T12:00:00Z");
const JOB: RuleJob = { companyName: "Stripe", type: "intern" };
const MATCH: RuleMatch = { score: 90 };

const campaign = (overrides: Partial<RuleCampaign> = {}, rules: Partial<CampaignRules> = {}): RuleCampaign => ({
  status: "active",
  timeZone: "America/New_York",
  inForce: { rules: { ...RULES, ...rules } },
  ...overrides,
});

const fail = (reason: string) => ({ ok: false, reason });

describe("checkApplication: each branch", () => {
  it("1. fails when there is no campaign", () => {
    expect(checkApplication(JOB, MATCH, null, 0, NOW)).toEqual(fail("No approved campaign yet"));
  });

  it("1. fails when the campaign has no approved version", () => {
    expect(checkApplication(JOB, MATCH, campaign({ inForce: null }), 0, NOW)).toEqual(
      fail("No approved campaign yet"),
    );
  });

  it("2. fails when the campaign is paused", () => {
    expect(checkApplication(JOB, MATCH, campaign({ status: "paused" }), 0, NOW)).toEqual(
      fail("Campaign is paused"),
    );
  });

  it("2. treats a revoked campaign as paused", () => {
    expect(checkApplication(JOB, MATCH, campaign({ status: "revoked" }), 0, NOW)).toEqual(
      fail("Campaign is paused"),
    );
  });

  it("2. reports an ended campaign status as ended", () => {
    expect(checkApplication(JOB, MATCH, campaign({ status: "ended" }), 0, NOW)).toEqual(
      fail("Campaign has ended"),
    );
  });

  it("2. fails closed on an unknown status from the database", () => {
    const odd = campaign({ status: "archived" as RuleCampaign["status"] });
    expect(checkApplication(JOB, MATCH, odd, 0, NOW)).toEqual(fail("Campaign is paused"));
  });

  it("3. fails when now is after endsOn", () => {
    expect(checkApplication(JOB, MATCH, campaign({}, { endsOn: "2026-11-06" }), 0, NOW)).toEqual(
      fail("Campaign has ended"),
    );
  });

  it("4. holds ask-first companies as top choices", () => {
    const job = { companyName: "Meta", type: "intern" };
    expect(checkApplication(job, MATCH, campaign(), 0, NOW)).toEqual({
      ok: false,
      reason: "Top choice: referral first",
      topChoice: true,
    });
  });

  it("5. fails when the company is not on either list", () => {
    const job = { companyName: "Ramp", type: "intern" };
    expect(checkApplication(job, MATCH, campaign(), 0, NOW)).toEqual(fail("Not on your company list"));
  });

  it("6. fails when the job type is not in roles", () => {
    const job = { companyName: "Stripe", type: "newgrad" };
    expect(checkApplication(job, MATCH, campaign(), 0, NOW)).toEqual(fail("Role type not in campaign"));
  });

  it("6. fails when the job type is unknown (null)", () => {
    const job = { companyName: "Stripe", type: null };
    expect(checkApplication(job, MATCH, campaign(), 0, NOW)).toEqual(fail("Role type not in campaign"));
  });

  it("7. fails when the match is below minMatch, naming the threshold", () => {
    expect(checkApplication(JOB, { score: 74 }, campaign(), 0, NOW)).toEqual(fail("Match below 75%"));
    expect(checkApplication(JOB, { score: 79 }, campaign({}, { minMatch: 80 }), 0, NOW)).toEqual(
      fail("Match below 80%"),
    );
  });

  it("7. fails when there is no match row", () => {
    expect(checkApplication(JOB, null, campaign(), 0, NOW)).toEqual(fail("Match below 75%"));
  });

  it("7. fails closed when the score is not a number", () => {
    expect(checkApplication(JOB, { score: Number.NaN }, campaign(), 0, NOW)).toEqual(fail("Match below 75%"));
  });

  it("8. fails when the weekly cap is reached", () => {
    expect(checkApplication(JOB, MATCH, campaign(), 5, NOW)).toEqual(fail("Weekly limit reached"));
    expect(checkApplication(JOB, MATCH, campaign(), 9, NOW)).toEqual(fail("Weekly limit reached"));
  });

  it("8. fails closed when weekCount is not a number", () => {
    expect(checkApplication(JOB, MATCH, campaign(), Number.NaN, NOW)).toEqual(fail("Weekly limit reached"));
  });

  it("9. passes when every rule fits", () => {
    expect(checkApplication(JOB, MATCH, campaign(), 0, NOW)).toEqual({ ok: true, reason: "Fits campaign rules" });
  });

  it("uses the exported reason constants", () => {
    expect(RULE_REASONS.fits).toBe("Fits campaign rules");
    expect(RULE_REASONS.matchBelow(75)).toBe("Match below 75%");
  });
});

describe("checkApplication: boundaries", () => {
  it("passes when score equals minMatch", () => {
    expect(checkApplication(JOB, { score: 75 }, campaign(), 0, NOW).ok).toBe(true);
  });

  it("passes one below the cap and fails at the cap", () => {
    expect(checkApplication(JOB, MATCH, campaign(), 4, NOW).ok).toBe(true);
    expect(checkApplication(JOB, MATCH, campaign(), 5, NOW).reason).toBe("Weekly limit reached");
  });

  it("is still active through the last second of endsOn in the user's zone", () => {
    // 2026-12-15 23:59:59 in New York (EST, -5).
    const lastSecond = new Date("2026-12-16T04:59:59Z");
    expect(checkApplication(JOB, MATCH, campaign(), 0, lastSecond).ok).toBe(true);
  });

  it("has ended at the first instant of the next local day", () => {
    const nextDay = new Date("2026-12-16T05:00:00Z");
    expect(checkApplication(JOB, MATCH, campaign(), 0, nextDay)).toEqual(fail("Campaign has ended"));
  });

  it("ends earlier in UTC for zones ahead of UTC", () => {
    // UTC is still Dec 15, but Tokyo is already Dec 16.
    const now = new Date("2026-12-15T15:00:00Z");
    expect(checkApplication(JOB, MATCH, campaign({ timeZone: "Asia/Tokyo" }), 0, now).reason).toBe(
      "Campaign has ended",
    );
    expect(checkApplication(JOB, MATCH, campaign({ timeZone: "UTC" }), 0, now).ok).toBe(true);
  });

  it("ends later in UTC for zones behind UTC", () => {
    // UTC is already Dec 16, but Los Angeles is still Dec 15.
    const now = new Date("2026-12-16T07:59:59Z");
    expect(checkApplication(JOB, MATCH, campaign({ timeZone: "America/Los_Angeles" }), 0, now).ok).toBe(true);
    expect(checkApplication(JOB, MATCH, campaign({ timeZone: "UTC" }), 0, now).reason).toBe("Campaign has ended");
  });

  it("throws on an unknown time zone instead of guessing", () => {
    expect(() => checkApplication(JOB, MATCH, campaign({ timeZone: "Nope/Zone" }), 0, NOW)).toThrow(
      /Unknown time zone/,
    );
  });
});

describe("checkApplication: company name matching", () => {
  it("matches auto companies case-insensitively after trimming", () => {
    const job = { companyName: "  capital ONE ", type: "intern" };
    expect(checkApplication(job, MATCH, campaign(), 0, NOW).ok).toBe(true);
  });

  it("matches ask-first companies case-insensitively after trimming", () => {
    const job = { companyName: "google\t", type: "intern" };
    expect(checkApplication(job, MATCH, campaign({}, { askFirstCompanies: [" GOOGLE "] }), 0, NOW).topChoice).toBe(
      true,
    );
  });
});

describe("checkApplication: ordering (first failure wins)", () => {
  it("no approved version beats a paused status", () => {
    expect(checkApplication(JOB, MATCH, campaign({ status: "paused", inForce: null }), 0, NOW).reason).toBe(
      "No approved campaign yet",
    );
  });

  it("paused beats ask-first", () => {
    const job = { companyName: "Meta", type: "intern" };
    expect(checkApplication(job, MATCH, campaign({ status: "paused" }), 0, NOW)).toEqual(fail("Campaign is paused"));
  });

  it("paused beats ended-by-date", () => {
    const result = checkApplication(JOB, MATCH, campaign({ status: "paused" }, { endsOn: "2026-01-01" }), 0, NOW);
    expect(result.reason).toBe("Campaign is paused");
  });

  it("ended beats ask-first", () => {
    const job = { companyName: "Meta", type: "intern" };
    const result = checkApplication(job, MATCH, campaign({}, { endsOn: "2026-01-01" }), 0, NOW);
    expect(result).toEqual(fail("Campaign has ended"));
  });

  it("ask-first beats role, match and cap failures", () => {
    const job = { companyName: "Meta", type: "newgrad" };
    expect(checkApplication(job, { score: 10 }, campaign(), 99, NOW).topChoice).toBe(true);
  });

  it("company list beats role, match and cap failures", () => {
    const job = { companyName: "Ramp", type: null };
    expect(checkApplication(job, null, campaign(), 99, NOW).reason).toBe("Not on your company list");
  });

  it("role beats match and cap failures", () => {
    const job = { companyName: "Stripe", type: "newgrad" };
    expect(checkApplication(job, null, campaign(), 99, NOW).reason).toBe("Role type not in campaign");
  });

  it("match beats the weekly cap", () => {
    expect(checkApplication(JOB, { score: 10 }, campaign(), 99, NOW).reason).toBe("Match below 75%");
  });

  it("only sets topChoice on the ask-first failure", () => {
    expect(checkApplication(JOB, MATCH, campaign(), 99, NOW)).not.toHaveProperty("topChoice");
    expect(checkApplication(JOB, MATCH, campaign(), 0, NOW)).not.toHaveProperty("topChoice");
  });
});

describe("checkApplication: edited but not re-approved", () => {
  const v1Rules: CampaignRules = RULES;
  const v2Rules: CampaignRules = { ...RULES, autoCompanies: ["Datadog", "Capital One"] };
  const versions = [
    { id: "v1", rules: v1Rules, createdAt: new Date("2026-11-01T00:00:00Z"), approvedAt: new Date("2026-11-01T00:05:00Z") },
    { id: "v2", rules: v2Rules, createdAt: new Date("2026-11-05T00:00:00Z"), approvedAt: null },
  ];

  it("keeps the approved v1 in force, so the removed company still passes", () => {
    const inForce = pickVersionInForce(versions);
    expect(inForce?.id).toBe("v1");
    const result = checkApplication(JOB, MATCH, campaign({ inForce }), 0, NOW);
    expect(result).toEqual({ ok: true, reason: "Fits campaign rules" });
  });

  it("applies v2 only once it is approved", () => {
    const approved = versions.map((version) =>
      version.id === "v2" ? { ...version, approvedAt: new Date("2026-11-06T00:00:00Z") } : version,
    );
    const inForce = pickVersionInForce(approved);
    expect(inForce?.id).toBe("v2");
    expect(checkApplication(JOB, MATCH, campaign({ inForce }), 0, NOW)).toEqual(fail("Not on your company list"));
  });
});

describe("checkApplication: purity", () => {
  it("does not mutate its inputs", () => {
    const c = campaign();
    const snapshot = JSON.stringify({ JOB, MATCH, c });
    checkApplication({ ...JOB, companyName: "  stripe " }, MATCH, c, 0, NOW);
    expect(JSON.stringify({ JOB, MATCH, c })).toBe(snapshot);
  });
});
