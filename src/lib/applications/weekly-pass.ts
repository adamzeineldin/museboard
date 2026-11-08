import "server-only";
import { writeAudit } from "@/lib/audit";
import { normalizeCompanyName } from "@/lib/company-name";
import { db } from "@/lib/db";
import { localDateString, RULE_REASONS, type RuleCampaign } from "@/lib/rules";
import type { Actor, CampaignRules } from "@/lib/types";
import { errorMessage, parseActorOrThrow, roleLabel } from "./client";
import { loadEvalContext } from "./context";
import { isApplicationError } from "./errors";
import { prepareWithOutcome } from "./prepare";
import type { WeeklyPassSummary } from "./types";

/** Why the pass cannot run at all (campaign-level checks 1-3 of the rule check), or null. */
function campaignBlock(ruleCampaign: RuleCampaign | null, now: Date): string | null {
  const rules = ruleCampaign?.inForce?.rules;
  if (!ruleCampaign || !rules) return RULE_REASONS.noApprovedVersion;
  if (ruleCampaign.status === "ended") return RULE_REASONS.ended;
  if (ruleCampaign.status !== "active") return RULE_REASONS.paused;
  if (localDateString(now, ruleCampaign.timeZone) > rules.endsOn) return RULE_REASONS.ended;
  return null;
}

interface Candidate {
  id: string;
  label: string;
}

/**
 * "New matches" (docs/ARCHITECTURE.md "Weekly pass candidates"): open jobs with a match at or above
 * minMatch, no application yet, a campaign role type, and a company on the auto or ask-first list.
 * Best matches first, so the weekly cap goes to the strongest roles.
 */
async function findCandidates(userId: string, rules: CampaignRules): Promise<Candidate[]> {
  const companies = new Set([...rules.autoCompanies, ...rules.askFirstCompanies].map(normalizeCompanyName));
  const jobs = await db.job.findMany({
    where: {
      closedAt: null,
      type: { in: rules.roles },
      applications: { none: { userId } },
      matches: { some: { userId, score: { gte: rules.minMatch } } },
    },
    include: { company: true, matches: { where: { userId }, select: { score: true } } },
  });
  return jobs
    .filter((job) => companies.has(normalizeCompanyName(job.company.name)))
    .map((job) => ({ job, score: job.matches[0]?.score ?? 0 }))
    .sort((a, b) => b.score - a.score || a.job.firstSeenAt.getTime() - b.job.firstSeenAt.getTime() || a.job.id.localeCompare(b.job.id))
    .map(({ job }) => ({ id: job.id, label: roleLabel(job.company.name, job.title) }));
}

function describe(summary: WeeklyPassSummary): string {
  if (summary.reason) return `Weekly pass didn't run: ${summary.reason}`;
  const parts = [
    `Prepared ${summary.submitted.length}`,
    `${summary.waiting.length} waiting on you`,
    `${summary.referralDrafts.length} referral ask${summary.referralDrafts.length === 1 ? "" : "s"} drafted`,
  ];
  return `${parts.join(", ")}.`;
}

async function prepareAll(userId: string, actor: Actor, now: Date, candidates: Candidate[]): Promise<WeeklyPassSummary> {
  const summary: Required<Omit<WeeklyPassSummary, "reason">> & { reason?: string } = {
    submitted: [],
    waiting: [],
    referralDrafts: [],
    failed: [],
  };
  // Sequential on purpose: each prepare counts the week, so the cap holds across the pass.
  for (const candidate of candidates) {
    try {
      const outcome = await prepareWithOutcome(userId, candidate.id, actor, now);
      if (!outcome.changed) continue;
      const bucket = outcome.application.status === "prepared" ? summary.submitted : summary.waiting;
      bucket.push(candidate.label);
      if (outcome.referralDraftFor) summary.referralDrafts.push(candidate.label);
    } catch (error) {
      if (isApplicationError(error) && error.code === "no_resume") return { ...summary, reason: error.message };
      // The posting closed after the candidates were read: an expected refusal (audited by prepare), not a failure.
      if (isApplicationError(error) && error.code === "closed") continue;
      console.error("[applications] weekly pass: prepare failed", { userId, jobId: candidate.id, error: errorMessage(error) });
      summary.failed.push(candidate.label);
    }
  }
  return summary;
}

/** Run prepareApplication for every new match the campaign covers. Returns company + title strings. */
export async function runWeeklyPass(userId: string, actor: Actor, now: Date = new Date()): Promise<WeeklyPassSummary> {
  const parsedActor = parseActorOrThrow(actor);
  const { rule } = await loadEvalContext(db, userId);
  const blocked = campaignBlock(rule.ruleCampaign, now);
  const candidates = blocked || !rule.rules ? [] : await findCandidates(userId, rule.rules);
  const ran: WeeklyPassSummary = blocked
    ? { submitted: [], waiting: [], referralDrafts: [], reason: blocked }
    : await prepareAll(userId, parsedActor, now, candidates);
  const { failed, ...rest } = ran;
  const summary: WeeklyPassSummary = failed && failed.length > 0 ? ran : rest;
  await writeAudit(userId, parsedActor, "weekly_pass.ran", {
    summary: describe(summary),
    versionId: rule.versionInForce?.id ?? null,
    candidates: candidates.length,
    ...summary,
  });
  return summary;
}
