import "server-only";
import type { Application, Resume, User } from "@/generated/prisma/client";
import type { RuleContext } from "@/lib/campaign";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/types";
import { isUniqueViolation, parseActorOrThrow, parseIdOrThrow, type DbClient } from "./client";
import { loadEvalContext, loadJobOrThrow, pickResume, runCheck, toJson, type CheckRun } from "./context";
import { APPLICATION_REASONS, ApplicationError } from "./errors";
import { buildApplicationPacket, type JobWithCompany } from "./packet";
import { draftReferralIfNeeded } from "./referral";

export interface PrepareOutcome {
  application: Application;
  /** True when this call created the application or moved it from waiting to prepared. */
  changed: boolean;
  /** Name of the contact a referral ask was drafted for, if this call drafted one. */
  referralDraftFor: string | null;
}

interface PrepareScope {
  user: User;
  job: JobWithCompany;
  rule: RuleContext;
  now: Date;
}

type TxResult = { application: Application; check: CheckRun | null; changed: boolean };

/** Inside the transaction: count the week, check, and create or promote. Serialized so the cap holds. */
async function decide(
  tx: DbClient,
  scope: PrepareScope,
  existing: Application | null,
  resume: Resume,
): Promise<TxResult> {
  const check = await runCheck(tx, {
    userId: scope.user.id,
    job: scope.job,
    rule: scope.rule,
    timeZone: scope.user.timezone,
    now: scope.now,
  });
  const ok = check.result.ok;
  if (existing && !ok) return { application: existing, check, changed: false };

  const decision = {
    status: ok ? "prepared" : "waiting",
    decidedBy: "campaign",
    reason: check.result.reason,
    decidedAt: ok ? scope.now : null,
    packet: ok ? toJson(buildApplicationPacket(scope.user, scope.job, resume)) : undefined,
    checkResult: toJson(check.stored),
    campaignVersionId: scope.rule.versionInForce?.id ?? null,
  };
  const application = existing
    ? await tx.application.update({ where: { id: existing.id }, data: decision })
    : await tx.application.create({
        data: { ...decision, userId: scope.user.id, jobId: scope.job.id, resumeId: resume.id },
      });
  return { application, check, changed: true };
}

async function auditPrepared(actor: Actor, scope: PrepareScope, outcome: TxResult, recheck: boolean): Promise<void> {
  const stored = outcome.check?.stored;
  await writeAudit(scope.user.id, actor, "application.prepared", {
    applicationId: outcome.application.id,
    jobId: scope.job.id,
    company: scope.job.company.name,
    title: scope.job.title,
    status: outcome.application.status,
    recheck,
    ...stored,
  });
}

async function blockForMissingResume(actor: Actor, scope: PrepareScope): Promise<never> {
  await writeAudit(scope.user.id, actor, "application.blocked", {
    jobId: scope.job.id,
    company: scope.job.company.name,
    title: scope.job.title,
    ok: false,
    reason: APPLICATION_REASONS.uploadResume,
  });
  throw new ApplicationError("no_resume", APPLICATION_REASONS.uploadResume);
}

async function resumeFor(existing: Application | null, scope: PrepareScope): Promise<Resume | null> {
  if (existing) return db.resume.findUnique({ where: { id: existing.resumeId } });
  return pickResume(db, scope.user.id, scope.rule);
}

/** Run the transaction; a concurrent create of the same (userId, jobId) resolves to the winner's row. */
async function decideOnce(scope: PrepareScope, existing: Application | null, resume: Resume): Promise<TxResult> {
  try {
    return await db.$transaction((tx) => decide(tx, scope, existing, resume));
  } catch (error) {
    if (existing || !isUniqueViolation(error)) throw error;
    const winner = await db.application.findUniqueOrThrow({
      where: { userId_jobId: { userId: scope.user.id, jobId: scope.job.id } },
    });
    return { application: winner, check: null, changed: false };
  }
}

/**
 * Shared by prepareApplication and runWeeklyPass. Idempotent per (userId, jobId): an existing
 * application comes back unchanged unless it is waiting and the rule check now passes.
 */
export async function prepareWithOutcome(
  userId: string,
  jobId: string,
  actor: Actor,
  now: Date = new Date(),
): Promise<PrepareOutcome> {
  const parsedActor = parseActorOrThrow(actor);
  const id = parseIdOrThrow(jobId, "job");
  const job = await loadJobOrThrow(db, id);
  const existing = await db.application.findUnique({ where: { userId_jobId: { userId, jobId: id } } });
  if (existing && existing.status !== "waiting") return { application: existing, changed: false, referralDraftFor: null };

  const { user, rule } = await loadEvalContext(db, userId);
  const scope: PrepareScope = { user, job, rule, now };
  if (!existing && job.closedAt) throw new ApplicationError("closed", "This posting has closed.");
  const resume = await resumeFor(existing, scope);
  if (!resume) return blockForMissingResume(parsedActor, scope);

  const outcome = await decideOnce(scope, existing, resume);
  if (!outcome.changed) return { application: outcome.application, changed: false, referralDraftFor: null };
  await auditPrepared(parsedActor, scope, outcome, Boolean(existing));

  const referralDraftFor = outcome.check?.result.topChoice
    ? await draftReferralIfNeeded(parsedActor, outcome.application, job)
    : null;
  return { application: outcome.application, changed: true, referralDraftFor };
}

/** Contract: create (or re-check) the Application for one job. See docs/ARCHITECTURE.md. */
export async function prepareApplication(
  userId: string,
  jobId: string,
  actor: Actor,
  now: Date = new Date(),
): Promise<Application> {
  return (await prepareWithOutcome(userId, jobId, actor, now)).application;
}
