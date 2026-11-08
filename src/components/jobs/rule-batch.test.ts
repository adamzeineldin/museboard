import { describe, expect, it } from "vitest";
import { checkApplication, type RuleCampaign } from "@/lib/rules";
import { evaluateJobs } from "./rule-batch";

const NOW = new Date("2026-11-07T12:00:00Z");
const campaign = (status: RuleCampaign["status"], endsOn = "2026-12-15"): RuleCampaign => ({
  status,
  timeZone: "America/New_York",
  inForce: {
    rules: { roles: ["intern"], autoCompanies: ["Stripe", "Ramp"], askFirstCompanies: ["Meta"], weeklyCap: 3, minMatch: 75, endsOn },
  },
});

const jobs = [
  { id: "a", companyName: "Stripe", type: "intern" },
  { id: "b", companyName: "Meta", type: "intern" },
  { id: "c", companyName: "Palantir", type: "intern" },
  { id: "d", companyName: "Ramp", type: "newgrad" },
  { id: "e", companyName: "stripe ", type: "intern" },
  { id: "f", companyName: "Stripe", type: "intern" },
];
const scores = new Map([
  ["a", 90],
  ["b", 88],
  ["c", 80],
  ["d", 85],
  ["e", 60],
]);

describe("evaluateJobs", () => {
  it.each([
    ["no campaign", null, 0],
    ["active", campaign("active"), 0],
    ["active at cap", campaign("active"), 3],
    ["paused", campaign("paused"), 0],
    ["ended", campaign("active", "2026-11-01"), 0],
  ] as const)("matches checkApplication job by job (%s)", (_label, rc, weekCount) => {
    const results = evaluateJobs(jobs, scores, { available: true, campaign: rc, weekCount }, NOW);
    for (const job of jobs) {
      const score = scores.get(job.id);
      const expected = checkApplication(job, score === undefined ? null : { score }, rc, weekCount, NOW);
      expect(results.get(job.id)).toEqual(expected);
    }
  });

  it("returns null results when rule inputs are unavailable", () => {
    const results = evaluateJobs(jobs, scores, { available: false }, NOW);
    expect([...results.values()].every((r) => r === null)).toBe(true);
  });
});
