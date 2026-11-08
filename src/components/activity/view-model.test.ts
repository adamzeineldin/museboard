import { describe, expect, it } from "vitest";
import { describeAuditEvent, initials, passToastMessage, statsModel } from "./view-model";

const event = (action: string, payload: Record<string, unknown>, actor: "user" | "inroad" | "muse" = "inroad") => ({
  actor,
  action,
  payload,
});

describe("describeAuditEvent", () => {
  it.each([
    [event("application.prepared", { ok: true, reason: "Fits campaign rules", weekCount: 1 }), "Inroad: Checked against your rules: Fits campaign rules. Ready to submit."],
    [event("application.prepared", { ok: true, reason: "Fits campaign rules", recheck: true }), "Inroad: Rules now fit. Ready to submit."],
    [event("application.prepared", { ok: false, reason: "Weekly limit reached" }, "muse"), "Muse: Held for you: Weekly limit reached."],
    [event("application.approved", {}, "user"), "You: Approved. Ready to submit."],
    [event("application.skipped", {}, "user"), "You: Skipped."],
    [event("application.referral_drafted", { contactName: "Priya N." }), "Inroad: Drafted a referral ask to Priya N. You send it yourself."],
    [event("application.referral_draft_failed", {}), "Inroad: Couldn't draft a referral ask."],
    [event("application.packet_requested", { allowed: true }, "muse"), "Muse: Packet released for submission."],
    [event("application.packet_requested", { allowed: false, reason: "Campaign is paused" }, "muse"), "Muse: Packet refused: Campaign is paused."],
    [event("application.submitted", {}, "user"), "You: Marked as submitted."],
    [event("application.mystery", {}), "Inroad: application.mystery"],
  ])("%o", (input, text) => {
    expect(describeAuditEvent(input)).toBe(text);
  });

  it("copes with a reason that is missing or not a string", () => {
    expect(describeAuditEvent(event("application.prepared", { ok: false, reason: 3 }))).toBe("Inroad: Held for you.");
  });
});

describe("passToastMessage", () => {
  it("summarizes a pass that ran", () => {
    expect(passToastMessage({ submitted: ["a", "b"], waiting: ["c"], referralDrafts: ["c"] })).toBe(
      "Prepared 2. 1 waiting on you. 1 referral ask drafted.",
    );
    expect(passToastMessage({ submitted: [], waiting: [], referralDrafts: [] })).toBe("No new roles since the last pass.");
    expect(passToastMessage({ submitted: ["a"], waiting: [], referralDrafts: [], failed: ["x"] })).toBe(
      "Prepared 1. 1 couldn't be prepared.",
    );
  });

  it("explains a pass that didn't run", () => {
    expect(passToastMessage({ submitted: [], waiting: [], referralDrafts: [], reason: "Campaign is paused" })).toBe(
      "Nothing ran: Campaign is paused.",
    );
  });
});

describe("statsModel and initials", () => {
  it("formats the weekly stat with a dash when there is no cap", () => {
    expect(statsModel({ weekCount: 2, weeklyCap: 5, waiting: 1, prepared: 0, submitted: 3, skipped: 0 })[0]).toEqual({
      value: "2/5",
      label: "Applied this week",
    });
    expect(statsModel({ weekCount: 0, weeklyCap: null, waiting: 0, prepared: 0, submitted: 0, skipped: 0 })[0].value).toBe("0/–");
  });

  it("builds logo initials", () => {
    expect(initials("Capital One")).toBe("CO");
    expect(initials("stripe")).toBe("S");
    expect(initials("  ")).toBe("?");
  });
});
