import { localDateString } from "./time";
import { RULE_REASONS, type RuleCampaign, type RuleCheckResult, type RuleJob, type RuleMatch } from "./types";

// Brief sec. 4: the rule check. Pure; checks run in order and the first failure wins.
// Numeric comparisons are written to fail closed: a NaN score or weekCount never passes.

const normalizeCompany = (name: string): string => name.trim().toLowerCase();

const listIncludes = (companies: readonly string[], normalized: string): boolean =>
  companies.some((company) => normalizeCompany(company) === normalized);

const fail = (reason: string): RuleCheckResult => ({ ok: false, reason });

/** Reason the campaign status blocks applying, or null when it is active. Unknown statuses fail closed. */
function statusFailure(status: string): string | null {
  if (status === "active") return null;
  if (status === "ended") return RULE_REASONS.ended;
  return RULE_REASONS.paused;
}

export function checkApplication(
  job: RuleJob,
  match: RuleMatch | null,
  campaign: RuleCampaign | null,
  weekCount: number,
  now: Date,
): RuleCheckResult {
  const rules = campaign?.inForce?.rules;
  if (!campaign || !rules) return fail(RULE_REASONS.noApprovedVersion);

  const blockedBy = statusFailure(campaign.status);
  if (blockedBy) return fail(blockedBy);

  // endsOn is inclusive: the campaign runs through the end of that day in the user's zone.
  if (localDateString(now, campaign.timeZone) > rules.endsOn) return fail(RULE_REASONS.ended);

  const company = normalizeCompany(job.companyName);
  if (listIncludes(rules.askFirstCompanies, company)) {
    return { ok: false, reason: RULE_REASONS.topChoice, topChoice: true };
  }
  if (!listIncludes(rules.autoCompanies, company)) return fail(RULE_REASONS.notOnCompanyList);

  const roles: readonly string[] = rules.roles;
  if (job.type === null || !roles.includes(job.type)) return fail(RULE_REASONS.roleNotInCampaign);

  if (!match || !(match.score >= rules.minMatch)) return fail(RULE_REASONS.matchBelow(rules.minMatch));

  if (!(weekCount < rules.weeklyCap)) return fail(RULE_REASONS.weeklyLimit);

  return { ok: true, reason: RULE_REASONS.fits };
}
