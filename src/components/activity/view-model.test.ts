import { describe, expect, it } from "vitest";
import { APPLICATION_REASONS } from "@/lib/applications/errors";
import { RELEASE_UNAVAILABLE } from "../release/release-view";
import {
  describeAuditEvent,
  emptyActivityCopy,
  heldNote,
  hiddenHistoryNote,
  initials,
  passToastMessage,
  pipelineSubtitle,
  statsModel,
} from "./view-model";

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
    [event("application.record_refused", { reason: "Weekly limit reached" }, "muse"), "Muse: Submission not recorded: Weekly limit reached."],
    [event("application.record_refused", {}, "user"), "You: Submission not recorded: its packet was never released."],
    [event("application.mystery", {}), "Inroad: application.mystery"],
  ])("%o", (input, text) => {
    expect(describeAuditEvent(input)).toBe(text);
  });

  it.each([
    ["application.record_refused", { reason: APPLICATION_REASONS.postingClosed }, "Muse: Submission not recorded: This posting has closed."],
    ["application.record_refused", { reason: "Weekly limit reached." }, "Muse: Submission not recorded: Weekly limit reached."],
    ["application.packet_requested", { allowed: false, reason: APPLICATION_REASONS.postingClosed }, "Muse: Packet refused: This posting has closed."],
    ["application.packet_requested", { allowed: false, reason: "Campaign is paused." }, "Muse: Packet refused: Campaign is paused."],
    ["application.prepared", { ok: false, reason: APPLICATION_REASONS.postingClosed }, "Muse: Held for you: This posting has closed."],
    ["application.prepared", { ok: false, reason: "Weekly limit reached." }, "Muse: Held for you: Weekly limit reached."],
    ["application.record_refused", { reason: "Was the packet released?" }, "Muse: Submission not recorded: Was the packet released?"],
    ["application.packet_requested", { allowed: false, reason: "Campaign is paused!" }, "Muse: Packet refused: Campaign is paused!"],
  ])("does not double the full stop for %s with %o", (action, payload, text) => {
    expect(describeAuditEvent(event(action, payload, "muse"))).toBe(text);
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

  it("doesn't lead with 'Prepared 0' when everything was held or failed", () => {
    expect(passToastMessage({ submitted: [], waiting: ["a", "b"], referralDrafts: ["a"] })).toBe(
      "Nothing prepared this pass. 2 waiting on you. 1 referral ask drafted.",
    );
    expect(passToastMessage({ submitted: [], waiting: [], referralDrafts: [], failed: ["x"] })).toBe(
      "Nothing prepared this pass. 1 couldn't be prepared.",
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
      label: "Weekly cap used",
    });
    expect(statsModel({ weekCount: 0, weeklyCap: null, waiting: 0, prepared: 0, submitted: 0, skipped: 0 })[0].value).toBe("0/–");
  });

  it("says how many older rows are not listed", () => {
    expect(hiddenHistoryNote(1)).toBe("1 older submitted or skipped application isn't listed. The totals above include them.");
    expect(hiddenHistoryNote(3)).toBe("3 older submitted or skipped applications aren't listed. The totals above include them.");
  });

  it("builds logo initials", () => {
    expect(initials("Capital One")).toBe("CO");
    expect(initials("stripe")).toBe("S");
    expect(initials("  ")).toBe("?");
  });
});

describe("heldNote", () => {
  it("says nothing will be sent for a closed posting", () => {
    const note = heldNote({ held: APPLICATION_REASONS.postingClosed, recordable: false });
    expect(note).toBe("This posting has closed, so nothing will be sent for it.");
  });

  it("asks for a reload when the release check could not run", () => {
    expect(heldNote({ held: RELEASE_UNAVAILABLE, recordable: false })).toBe("Inroad couldn't run the release check. Reload to try again.");
  });

  it("promises a rule-held row comes back on its own", () => {
    expect(heldNote({ held: "Weekly limit reached", recordable: false })).toMatch(/becomes ready again on its own/);
  });

  it("explains an already released packet, whatever the reason", () => {
    expect(heldNote({ held: APPLICATION_REASONS.postingClosed, recordable: true })).toMatch(/Muse already received this packet/);
  });

  it("is null for a row that is not held", () => {
    expect(heldNote({ held: null, recordable: true })).toBeNull();
  });
});

describe("emptyActivityCopy", () => {
  it("points at the Run button when a campaign is active", () => {
    expect(emptyActivityCopy(true)).toBe("Nothing yet. Run this week's pass above, or press Prepare on a job.");
  });

  it("asks for a campaign first when none is active", () => {
    expect(emptyActivityCopy(false)).toBe("Nothing yet. Approve or resume a campaign to get started.");
  });
});

describe("pipelineSubtitle", () => {
  it("says nothing was sent for a new user", () => {
    expect(pipelineSubtitle({ submitted: 0, waiting: 0, prepared: 0 })).toBe("Nothing has been sent yet.");
  });

  it("counts sent, prepared and waiting applications", () => {
    expect(pipelineSubtitle({ submitted: 1, waiting: 2, prepared: 3 })).toBe("1 application sent. 3 ready or held, 2 waiting on you.");
  });
});
