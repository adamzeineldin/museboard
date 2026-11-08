import { describe, expect, it } from "vitest";
import {
  ACTORS,
  APPLICATION_STATUSES,
  ATS_PROVIDERS,
  CAMPAIGN_STATUSES,
  CampaignRulesSchema,
  JOB_TYPES,
  actorSchema,
  applicationStatusSchema,
  atsSchema,
  campaignStatusSchema,
  connectorScopeSchema,
  contactSourceSchema,
  decidedBySchema,
  jobTypeSchema,
  outreachKindSchema,
  outreachStatusSchema,
  parseCampaignRules,
  approvedViaSchema,
  type CampaignRules,
} from "./types";

const validRules: CampaignRules = {
  roles: ["intern"],
  autoCompanies: ["Stripe", "Datadog", "Capital One", "Cloudflare", "Ramp"],
  askFirstCompanies: ["Meta", "Google"],
  resumeId: "res_123",
  weeklyCap: 5,
  minMatch: 75,
  endsOn: "2026-12-15",
};

describe("enum-like unions", () => {
  it("exposes the brief's allowed values", () => {
    expect(JOB_TYPES).toEqual(["intern", "newgrad"]);
    expect(ATS_PROVIDERS).toEqual(["greenhouse", "lever", "ashby", "workday"]);
    expect(CAMPAIGN_STATUSES).toEqual(["active", "paused", "revoked", "ended"]);
    expect(APPLICATION_STATUSES).toEqual(["prepared", "waiting", "submitted", "skipped"]);
    expect(ACTORS).toEqual(["user", "inroad", "muse"]);
  });

  it.each([
    [jobTypeSchema, "intern", "fulltime"],
    [atsSchema, "lever", "linkedin"],
    [campaignStatusSchema, "paused", "deleted"],
    [approvedViaSchema, "muse", "email"],
    [applicationStatusSchema, "waiting", "pending"],
    [decidedBySchema, "campaign", "muse"],
    [contactSourceSchema, "alumni-list", "linkedin"],
    [outreachKindSchema, "referral_ask", "cold_email"],
    [outreachStatusSchema, "sent_by_user", "sent"],
    [actorSchema, "inroad", "system"],
    [connectorScopeSchema, "write", "admin"],
  ])("accepts a valid value and rejects an invalid one (%#)", (schema, good, bad) => {
    expect(schema.safeParse(good).success).toBe(true);
    expect(schema.safeParse(bad).success).toBe(false);
  });
});

describe("CampaignRulesSchema", () => {
  it("accepts the brief's example rules", () => {
    expect(CampaignRulesSchema.parse(validRules)).toEqual(validRules);
  });

  it("trims company names and drops duplicates", () => {
    const parsed = CampaignRulesSchema.parse({
      ...validRules,
      autoCompanies: [" Stripe ", "Stripe", "Ramp"],
      roles: ["intern", "intern", "newgrad"],
    });
    expect(parsed.autoCompanies).toEqual(["Stripe", "Ramp"]);
    expect(parsed.roles).toEqual(["intern", "newgrad"]);
  });

  it("does not mutate the input", () => {
    const input = { ...validRules, autoCompanies: [" Stripe "] };
    CampaignRulesSchema.parse(input);
    expect(input.autoCompanies).toEqual([" Stripe "]);
  });

  it.each([
    ["no role types", { roles: [] }],
    ["unknown role type", { roles: ["contract"] }],
    ["weeklyCap below 1", { weeklyCap: 0 }],
    ["weeklyCap above 20", { weeklyCap: 21 }],
    ["fractional weeklyCap", { weeklyCap: 2.5 }],
    ["minMatch below 50", { minMatch: 49 }],
    ["minMatch above 100", { minMatch: 101 }],
    ["endsOn wrong format", { endsOn: "12/15/2026" }],
    ["endsOn impossible date", { endsOn: "2026-02-30" }],
    ["empty resumeId", { resumeId: "" }],
    ["empty company name", { autoCompanies: ["  "] }],
    ["company both auto and ask-first", { askFirstCompanies: ["Stripe"] }],
    ["unknown key", { extra: true }],
  ])("rejects %s", (_label, patch) => {
    expect(CampaignRulesSchema.safeParse({ ...validRules, ...patch }).success).toBe(false);
  });

  it("allows empty company lists (the approve button guards that in the UI)", () => {
    const parsed = CampaignRulesSchema.parse({ ...validRules, autoCompanies: [], askFirstCompanies: [] });
    expect(parsed.autoCompanies).toEqual([]);
  });

  it("treats auto/ask-first overlap case-insensitively", () => {
    const result = CampaignRulesSchema.safeParse({ ...validRules, askFirstCompanies: ["stripe"] });
    expect(result.success).toBe(false);
  });
});

describe("parseCampaignRules", () => {
  it("returns rules for valid JSON values", () => {
    expect(parseCampaignRules(validRules)).toEqual(validRules);
  });

  it("returns null for invalid stored JSON instead of throwing", () => {
    expect(parseCampaignRules({ roles: "intern" })).toBeNull();
    expect(parseCampaignRules(null)).toBeNull();
  });
});
