import { APPLICATION_REASONS } from "@/lib/applications/errors";
import type { Actor } from "@/lib/types";
import { RELEASE_UNAVAILABLE } from "../release/release-view";

// Pure view helpers for the Activity page.

export interface AuditLike {
  actor: Actor;
  action: string;
  payload: Record<string, unknown>;
}

export interface PassSummaryLike {
  submitted: string[];
  waiting: string[];
  referralDrafts: string[];
  reason?: string;
  failed?: string[];
}

export interface StatsLike {
  weekCount: number;
  weeklyCap: number | null;
  waiting: number;
  prepared: number;
  submitted: number;
  skipped: number;
}

const ACTOR_LABEL: Record<Actor, string> = { user: "You", inroad: "Inroad", muse: "Muse" };

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Add a full stop unless the text already ends a sentence (e.g. a name like "Priya N.", or a question). */
const endSentence = (value: string): string => (/[.!?]$/.test(value) ? value : `${value}.`);

function describeAction(action: string, payload: Record<string, unknown>): string {
  const reason = text(payload.reason);
  switch (action) {
    case "application.prepared":
      if (payload.ok === true) {
        return payload.recheck === true ? "Rules now fit. Ready to submit." : `Checked against your rules: ${reason ?? "fits"}. Ready to submit.`;
      }
      return reason ? endSentence(`Held for you: ${reason}`) : "Held for you.";
    case "application.approved":
      return "Approved. Ready to submit.";
    case "application.skipped":
      return "Skipped.";
    case "application.referral_drafted":
      return `${endSentence(`Drafted a referral ask to ${text(payload.contactName) ?? "your contact"}`)} You send it yourself.`;
    case "application.referral_draft_failed":
      return "Couldn't draft a referral ask.";
    case "application.packet_requested":
      return payload.allowed === true ? "Packet released for submission." : endSentence(`Packet refused: ${reason ?? "rules check failed"}`);
    case "application.submitted":
      return "Marked as submitted.";
    case "application.record_refused":
      return endSentence(`Submission not recorded: ${reason ?? "its packet was never released"}`);
    default:
      return action;
  }
}

/** One human-readable line for an audit event, e.g. "Muse: Held for you: Weekly limit reached." */
export function describeAuditEvent(event: AuditLike): string {
  return `${ACTOR_LABEL[event.actor] ?? event.actor}: ${describeAction(event.action, event.payload)}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export function passToastMessage(summary: PassSummaryLike): string {
  if (summary.reason) return `Nothing ran: ${summary.reason}.`;
  const failed = summary.failed?.length ?? 0;
  if (summary.submitted.length + summary.waiting.length + failed === 0) return "No new roles since the last pass.";
  const parts = [summary.submitted.length ? `Prepared ${summary.submitted.length}.` : "Nothing prepared this pass."];
  if (summary.waiting.length) parts.push(`${summary.waiting.length} waiting on you.`);
  if (summary.referralDrafts.length) parts.push(`${plural(summary.referralDrafts.length, "referral ask")} drafted.`);
  if (failed) parts.push(`${failed} couldn't be prepared.`);
  return parts.join(" ");
}

const HELD_NOTES: Record<string, string> = {
  [APPLICATION_REASONS.postingClosed]: "This posting has closed, so nothing will be sent for it.",
  [RELEASE_UNAVAILABLE]: "Inroad couldn't run the release check. Reload to try again.",
};

const RELEASED_NOTE =
  "Muse already received this packet before it was held, so Inroad won't release it again. If the application was sent, you can still mark it as submitted.";

const RULE_HELD_NOTE =
  "Inroad won't release this packet while the rule check says no. It becomes ready again on its own once your rules allow it (for example next week, or after you resume the campaign).";

/** The explanation under a held prepared row, picked by why it is held. Null when the row is not held. */
export function heldNote(row: { held: string | null; recordable: boolean }): string | null {
  if (!row.held) return null;
  if (row.recordable) return RELEASED_NOTE;
  return HELD_NOTES[row.held] ?? RULE_HELD_NOTE;
}

/** The Activity empty state, which depends on whether a campaign can run a pass from this page. */
export function emptyActivityCopy(campaignActive: boolean): string {
  return campaignActive
    ? "Nothing yet. Run this week's pass above, or press Prepare on a job."
    : "Nothing yet. Approve or resume a campaign to get started.";
}

export function statsModel(stats: StatsLike): Array<{ value: string; label: string }> {
  return [
    // weekCount is the cap reservation (prepared + submitted this week), not applications sent; see "Applied".
    { value: `${stats.weekCount}/${stats.weeklyCap ?? "–"}`, label: "Weekly cap used" },
    { value: String(stats.waiting), label: "Waiting on you" },
    { value: String(stats.submitted), label: "Applied" },
    { value: String(stats.skipped), label: "Skipped" },
  ];
}

/** Shown under the list when older submitted/skipped rows were left out. */
export function hiddenHistoryNote(hidden: number): string {
  return `${plural(hidden, "older submitted or skipped application")} ${hidden === 1 ? "isn't" : "aren't"} listed. The totals above include them.`;
}

export function initials(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("").slice(0, 2) || "?";
}

/** The line under the Pipeline title, e.g. "Inroad has sent 4 applications. 2 are waiting on you." */
export function pipelineSubtitle(stats: Pick<StatsLike, "submitted" | "waiting" | "prepared">): string {
  const sent = stats.submitted === 0 ? "Nothing has been sent yet." : `${plural(stats.submitted, "application")} sent.`;
  const open: string[] = [];
  if (stats.prepared) open.push(`${stats.prepared} ready or held`);
  if (stats.waiting) open.push(`${stats.waiting} waiting on you`);
  return open.length ? `${sent} ${open.join(", ")}.` : sent;
}
