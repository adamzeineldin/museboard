import { describe, expect, it } from "vitest";
import { rulesEqual } from "./equality";

const rules = {
  roles: ["intern", "newgrad"] as ("intern" | "newgrad")[],
  autoCompanies: ["Stripe", "Datadog"],
  askFirstCompanies: ["Meta"],
  resumeId: "r1",
  weeklyCap: 5,
  minMatch: 75,
  endsOn: "2026-12-15",
};

describe("rulesEqual", () => {
  it("ignores list order and company-name case", () => {
    expect(rulesEqual(rules, { ...rules, roles: ["newgrad", "intern"], autoCompanies: ["datadog", "STRIPE"] })).toBe(true);
  });

  it("detects any changed field", () => {
    expect(rulesEqual(rules, { ...rules, weeklyCap: 4 })).toBe(false);
    expect(rulesEqual(rules, { ...rules, askFirstCompanies: [] })).toBe(false);
    expect(rulesEqual(rules, { ...rules, resumeId: "r2" })).toBe(false);
    expect(rulesEqual(rules, { ...rules, endsOn: "2026-12-16" })).toBe(false);
    expect(rulesEqual(rules, { ...rules, minMatch: 80 })).toBe(false);
    expect(rulesEqual(rules, { ...rules, roles: ["intern"] })).toBe(false);
  });

  it("treats null as different from any rules, and null equal to null", () => {
    expect(rulesEqual(rules, null)).toBe(false);
    expect(rulesEqual(null, null)).toBe(true);
  });
});
