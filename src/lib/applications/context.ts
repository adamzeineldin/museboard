import "server-only";
import type { Match, Prisma, Resume, User } from "@/generated/prisma/client";
import { loadRuleCampaign, type RuleContext } from "@/lib/campaign";
import { checkApplication, type RuleCheckResult } from "@/lib/rules";
import type { DbClient } from "./client";
import { ApplicationError } from "./errors";
import type { JobWithCompany } from "./packet";
import type { StoredCheckResult } from "./types";
import { countAhead, countWeek, type RankedApplication } from "./week-count";

export async function loadUserOrThrow(client: DbClient, userId: string): Promise<User> {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApplicationError("not_found", "We couldn't find your account. Sign in again.");
  return user;
}

export async function loadJobOrThrow(client: DbClient, jobId: string): Promise<JobWithCompany> {
  const job = await client.job.findUnique({ where: { id: jobId }, include: { company: true } });
  if (!job) throw new ApplicationError("not_found", "We couldn't find that job.");
  return job;
}

/** The resume the campaign names, if it is in force and still the user's. Safe to call with a transaction client. */
export async function namedResume(client: DbClient, userId: string, rule: RuleContext): Promise<Resume | null> {
  const named = rule.rules?.resumeId;
  return named ? client.resume.findFirst({ where: { id: named, userId } }) : null;
}

export interface CheckRun {
  result: RuleCheckResult;
  stored: StoredCheckResult;
}

interface RunCheckInput {
  userId: string;
  job: JobWithCompany;
  rule: RuleContext;
  timeZone: string;
  now: Date;
  excludeApplicationId?: string;
  /** Re-check an existing prepared application at release time: count only the rows ranked ahead of it. */
  rankAgainst?: RankedApplication;
}

/** Run checkApplication with live data: the version in force, the user's match and this week's count. */
export async function runCheck(client: DbClient, input: RunCheckInput): Promise<CheckRun> {
  const [match, count]: [Match | null, number] = await Promise.all([
    client.match.findUnique({ where: { userId_jobId: { userId: input.userId, jobId: input.job.id } } }),
    input.rankAgainst
      ? countAhead(client, input.userId, input.rankAgainst, input.now, input.timeZone)
      : countWeek(client, input.userId, input.now, input.timeZone, input.excludeApplicationId),
  ]);
  const result = checkApplication(
    { companyName: input.job.company.name, type: input.job.type },
    match ? { score: match.score } : null,
    input.rule.ruleCampaign,
    count,
    input.now,
  );
  return {
    result,
    stored: {
      ok: result.ok,
      reason: result.reason,
      topChoice: result.topChoice === true,
      versionId: input.rule.versionInForce?.id ?? null,
      weekCount: count,
      score: match?.score ?? null,
    },
  };
}

export const toJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/** User + rule context for one rule check (the user's zone drives the ISO week and endsOn). */
export interface EvalContext {
  user: User;
  rule: RuleContext;
}

export async function loadEvalContext(client: DbClient, userId: string): Promise<EvalContext> {
  const user = await loadUserOrThrow(client, userId);
  return { user, rule: await loadRuleCampaign(userId, user.timezone, client) };
}
