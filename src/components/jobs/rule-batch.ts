import { checkApplication, type RuleCampaign, type RuleCheckResult } from "@/lib/rules";

// Batch rule checks for the Jobs feed. evaluateJobForUser (src/lib/applications) loads the rule
// campaign, the user's Match and weekCount for one job, then calls checkApplication. The feed loads
// the campaign (loadRuleCampaign) and weekCount once per request and runs the same pure check per job,
// so results are identical without N database round trips.

export type RuleInputs =
  | { available: true; campaign: RuleCampaign | null; weekCount: number }
  /** Campaign state or weekCount failed to load: show "Rule check unavailable" rather than guess. */
  | { available: false };

export interface RuleBatchJob {
  companyName: string;
  type: string | null;
}

export function evaluateJobs<J extends RuleBatchJob & { id: string }>(
  jobs: readonly J[],
  scores: ReadonlyMap<string, number>,
  rules: RuleInputs,
  now: Date,
): Map<string, RuleCheckResult | null> {
  return new Map(
    jobs.map((job) => {
      if (!rules.available) return [job.id, null] as const;
      const score = scores.get(job.id);
      const result = checkApplication(
        { companyName: job.companyName, type: job.type },
        score === undefined ? null : { score },
        rules.campaign,
        rules.weekCount,
        now,
      );
      return [job.id, result] as const;
    }),
  );
}
