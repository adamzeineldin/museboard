import { describe, expect, it } from "vitest";
import type { CampaignRules } from "@/lib/types";
import { summarizeRuleParts, summarizeRules } from "./summary";

const rules: CampaignRules = {
  roles: ["intern"],
  autoCompanies: ["Stripe", "Datadog", "Capital One", "Cloudflare", "Ramp"],
  askFirstCompanies: ["Meta", "Google"],
  resumeId: "res_1",
  weeklyCap: 5,
  minMatch: 75,
  endsOn: "2026-12-15",
};

describe("summarizeRules", () => {
  it("produces the prototype's sentences", () => {
    expect(summarizeRules(rules, { resumeName: "Resume_v3.pdf" })).toEqual([
      "Apply to internships at Stripe, Datadog, Capital One, Cloudflare, Ramp.",
      "Use Resume_v3.pdf, only for roles at 75%+ match.",
      "At most 5 applications a week, until Dec 15, 2026.",
      "Never apply to Meta, Google without asking me. Draft a referral ask instead.",
      "Anything else, or any change to these rules, needs a new yes from me.",
    ]);
  });

  it("names both role types in a fixed order, whatever order they were picked in", () => {
    const [first] = summarizeRules({ ...rules, roles: ["newgrad", "intern"] }, { resumeName: "r.pdf" });
    expect(first).toBe("Apply to internships and new grad roles at Stripe, Datadog, Capital One, Cloudflare, Ramp.");
  });

  it("names a single new grad role type", () => {
    const [first] = summarizeRules({ ...rules, roles: ["newgrad"] }, { resumeName: "r.pdf" });
    expect(first).toBe("Apply to new grad roles at Stripe, Datadog, Capital One, Cloudflare, Ramp.");
  });

  it("handles empty role and company lists", () => {
    const lines = summarizeRules({ ...rules, roles: [], autoCompanies: [], askFirstCompanies: [] }, { resumeName: "r.pdf" });
    expect(lines[0]).toBe("Apply to no role types at no companies.");
    expect(lines[3]).toBe("No companies set to ask first.");
  });

  it("uses the singular for a weekly cap of one", () => {
    expect(summarizeRules({ ...rules, weeklyCap: 1 }, { resumeName: "r.pdf" })[2]).toBe(
      "At most 1 application a week, until Dec 15, 2026.",
    );
  });

  it("always names the end date's year, so campaigns a year apart never read the same", () => {
    expect(summarizeRules({ ...rules, endsOn: "2027-12-15" }, { resumeName: "r.pdf" })[2]).toBe(
      "At most 5 applications a week, until Dec 15, 2027.",
    );
    expect(summarizeRules({ ...rules, endsOn: "2031-12-15" }, { resumeName: "r.pdf" })[2]).toBe(
      "At most 5 applications a week, until Dec 15, 2031.",
    );
  });

  it("falls back to a neutral resume name when none is given", () => {
    expect(summarizeRules(rules, { resumeName: "  " })[1]).toBe("Use your resume, only for roles at 75%+ match.");
  });
});

describe("summarizeRuleParts", () => {
  it("marks the values the user is agreeing to as strong", () => {
    const [first, , third] = summarizeRuleParts(rules, { resumeName: "Resume_v3.pdf" });
    expect(first.filter((part) => part.strong).map((part) => part.text)).toEqual([
      "internships",
      "Stripe, Datadog, Capital One, Cloudflare, Ramp",
    ]);
    expect(third.filter((part) => part.strong).map((part) => part.text)).toEqual(["5 applications a week", "Dec 15, 2026"]);
  });

  it("joins back into exactly the plain sentences", () => {
    const parts = summarizeRuleParts(rules, { resumeName: "Resume_v3.pdf" });
    expect(parts.map((sentence) => sentence.map((part) => part.text).join(""))).toEqual(
      summarizeRules(rules, { resumeName: "Resume_v3.pdf" }),
    );
  });
});
