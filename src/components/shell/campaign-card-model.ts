import type { EffectiveCampaignStatus } from "@/lib/campaign/ended";
import { formatShortDate } from "./format";

export interface CampaignCardInput {
  /** The effective status: an active campaign past its end date (in the user's zone) is "ended". */
  status: Exclude<EffectiveCampaignStatus, "revoked">;
  weeklyCap: number;
  endsOn: string;
  /** null when the count could not be computed. */
  weekCount: number | null;
  /** endsOn has passed in the user's zone (a paused campaign keeps "paused" but has still run out). */
  pastEnd: boolean;
}

/** "ended" covers any campaign that needs new dates: ended, or paused past its end date. */
export type CampaignCardModel =
  | { kind: "none" }
  | { kind: "ended"; heading: string; endsLabel: string }
  | { kind: "active"; heading: string; meterPercent: number; endsLabel: string };

const endedLabel = (endsOn: string): string => `Ended ${formatShortDate(endsOn)}. Pick a new end date to start again.`;
// A paused campaign stays paused after new dates are picked, so do not suggest that picking a date restarts it.
const pausedPastEndLabel = (endsOn: string): string => `Ended ${formatShortDate(endsOn)}. Pick a new end date, then resume.`;

/** View model for the campaign status card at the bottom of the rail. */
export function campaignCardModel(input: CampaignCardInput | null): CampaignCardModel {
  if (!input) return { kind: "none" };
  if (input.status === "ended") return { kind: "ended", heading: "Ended", endsLabel: endedLabel(input.endsOn) };
  if (input.status === "paused" && input.pastEnd) {
    return { kind: "ended", heading: "Paused", endsLabel: pausedPastEndLabel(input.endsOn) };
  }
  const state = input.status === "paused" ? "Paused" : "Active";
  const count = input.weekCount === null ? "–" : String(input.weekCount);
  const meterPercent =
    input.weekCount === null || input.weeklyCap <= 0 ? 0 : Math.min(100, (input.weekCount / input.weeklyCap) * 100);
  return {
    kind: "active",
    // The count is the cap reservation (prepared + submitted), so say "used", not "applied".
    heading: `${state} · ${count} of ${input.weeklyCap} used this week`,
    meterPercent,
    endsLabel: `Ends ${formatShortDate(input.endsOn)}`,
  };
}
