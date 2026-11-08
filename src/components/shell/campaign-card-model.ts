import type { CampaignStatus } from "@/lib/types";
import { formatShortDate } from "./format";

export interface CampaignCardInput {
  status: CampaignStatus;
  weeklyCap: number;
  endsOn: string;
  /** null when the count could not be computed. */
  weekCount: number | null;
}

export type CampaignCardModel =
  | { kind: "none" }
  | { kind: "active"; heading: string; meterPercent: number; endsLabel: string };

/** View model for the campaign status card at the bottom of the rail. */
export function campaignCardModel(input: CampaignCardInput | null): CampaignCardModel {
  if (!input) return { kind: "none" };
  const state = input.status === "paused" ? "Paused" : "Active";
  const count = input.weekCount === null ? "–" : String(input.weekCount);
  const meterPercent =
    input.weekCount === null || input.weeklyCap <= 0 ? 0 : Math.min(100, (input.weekCount / input.weeklyCap) * 100);
  return {
    kind: "active",
    heading: `${state} · ${count} of ${input.weeklyCap} this week`,
    meterPercent,
    endsLabel: `Ends ${formatShortDate(input.endsOn)}`,
  };
}
