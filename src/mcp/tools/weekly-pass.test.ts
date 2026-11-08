import { describe, expect, it } from "vitest";
import { weeklyPassSummary } from "./weekly-pass";

const empty = { submitted: [], waiting: [], referralDrafts: [], failed: [], reason: null };

describe("weeklyPassSummary", () => {
  it("reports the counts of a clean pass", () => {
    expect(weeklyPassSummary({ ...empty, submitted: ["A · x", "B · y"], waiting: ["C · z"] })).toBe(
      "Weekly pass: 2 applications cleared to submit, 1 waiting on the user, 0 referral asks drafted.",
    );
  });

  it("says how many matches could not be processed", () => {
    expect(weeklyPassSummary({ ...empty, submitted: ["A · x"], failed: ["B · y", "C · z"] })).toBe(
      "Weekly pass: 1 application cleared to submit, 0 waiting on the user, 0 referral asks drafted. 2 matches could not be processed (try again later).",
    );
  });

  it("says the pass didn't run when nothing was prepared before the stop", () => {
    expect(weeklyPassSummary({ ...empty, reason: "Campaign is paused" })).toBe("Weekly pass didn't run: Campaign is paused.");
  });

  it("says the pass stopped early when some matches were already handled", () => {
    expect(weeklyPassSummary({ ...empty, submitted: ["A · x"], reason: "Upload a resume first" })).toBe(
      "Weekly pass stopped early: Upload a resume first. So far: 1 application cleared to submit, 0 waiting on the user, 0 referral asks drafted.",
    );
  });
});
