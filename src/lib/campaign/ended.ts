import { localDateString } from "@/lib/rules/time";

// Pure (client-safe): has a campaign's end date passed in the user's zone? endsOn is inclusive, exactly as in
// checkApplication (src/lib/rules/check.ts): the campaign runs through the end of that day.

export type EffectiveCampaignStatus = "active" | "paused" | "revoked" | "ended";

export function isPastEnd(endsOn: string, now: Date, timeZone: string): boolean {
  return localDateString(now, timeZone) > endsOn;
}

/** An active campaign whose end date has passed reads "ended"; paused and revoked stay as they are. */
export function effectiveCampaignStatus(
  status: "active" | "paused" | "revoked",
  endsOn: string | null,
  now: Date,
  timeZone: string,
): EffectiveCampaignStatus {
  return status === "active" && endsOn !== null && isPastEnd(endsOn, now, timeZone) ? "ended" : status;
}

export type ConsentStatus = "active" | "paused" | "ended";

/** The state the campaign page shows: null with no rules in force or for a revoked campaign. */
export function consentStatus(
  stored: EffectiveCampaignStatus | null,
  endsOn: string | null,
  now: Date,
  timeZone: string,
): ConsentStatus | null {
  if (!stored || stored === "revoked") return null;
  if (stored === "ended") return "ended";
  return effectiveCampaignStatus(stored, endsOn, now, timeZone) === "ended" ? "ended" : stored;
}
