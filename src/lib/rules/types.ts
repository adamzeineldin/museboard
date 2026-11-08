import type { CampaignRules, CampaignStatus } from "@/lib/types";

// Small, DB-agnostic inputs for the rule check. Callers adapt Prisma rows into these shapes.

/** The parts of a job the rule check reads. `type` is a plain string so a DB row can be passed as-is. */
export interface RuleJob {
  companyName: string;
  type: string | null;
}

/** The user's match for the job. A missing match is passed as `null`. */
export interface RuleMatch {
  score: number;
}

/** The rule fields the check reads (a full `CampaignRules` object fits). */
export type RuleSet = Pick<
  CampaignRules,
  "roles" | "autoCompanies" | "askFirstCompanies" | "weeklyCap" | "minMatch" | "endsOn"
>;

export interface RuleCampaign {
  status: CampaignStatus;
  /** The newest approved version (see `pickVersionInForce`), or null when nothing is approved. */
  inForce: { rules: RuleSet } | null;
  /** The user's IANA time zone, used for `endsOn` (inclusive local date). */
  timeZone: string;
}

export interface RuleCheckResult {
  ok: boolean;
  reason: string;
  topChoice?: true;
}

export const RULE_REASONS = {
  noApprovedVersion: "No approved campaign yet",
  paused: "Campaign is paused",
  ended: "Campaign has ended",
  topChoice: "Top choice: referral first",
  notOnCompanyList: "Not on your company list",
  roleNotInCampaign: "Role type not in campaign",
  matchBelow: (minMatch: number): string => `Match below ${minMatch}%`,
  weeklyLimit: "Weekly limit reached",
  fits: "Fits campaign rules",
} as const;
