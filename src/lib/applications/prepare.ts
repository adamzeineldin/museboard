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
  /** True when this call created the application, promoted it from waiting, or updated its waiting reason. */
  changed: boolean;
  /** Name of the contact a referral ask was drafted for, if this call drafted one. */
  referralDraftFor: string | null;
}

interface PrepareScope {
  user: User;
  job: JobWithCompany;
  rule: RuleContext;
  now: Date;
  actor: Actor;
}

type TxResult = { application: Application; check: CheckRun | null; changed: boolean };

/** The resume a row keeps while it waits, and the one a campaign decision uses (the campaign's, else the default). */
interface ResumeChoice {
  kept: Resume;
  campaign: Resume;
}

function decisionData(scope: PrepareScope, check: CheckRun, resume: Resume) {
  const ok = check.result.ok;
  return {
    status: ok ? "prepared" : "waiting",
    decidedBy: "campaign",
    reason: check.result.reason,
    decidedAt: ok ? scope.now : null,
    // A new decision starts unreleased: only getSubmissionPacket sets packetReleasedAt.
    packetReleasedAt: null,
    packet: ok ? toJson(buildApplicationPacket(scope.user, scope.job, resume)) : undefined,
    checkResult: toJson(check.stored),
    campaignVersionId: scope.rule.versionInForce?.id ?? null,
  };
}

/** Written in the same transaction as the decision, so the state change and its audit commit together. */
async function auditPrepared(tx: DbClient, scope: PrepareScope, application: Application, check: CheckRun, recheck: boolean): Promise<void> {
  await writeAudit(
    scope.user.id,
    scope.actor,
    "application.prepared",
    {
      applicationId: application.id,
      jobId: scope.job.id,
      company: scope.job.company.name,
      title: scope.job.title,
      status: application.status,
      recheck,
      ...check.stored,
    },
    tx,
  );
}

const storedTopChoice = (application: Application): boolean =>
  (application.checkResult as { topChoice?: unknown } | null)?.topChoice === true;

/** A still-failing re-check with the same reason and top-choice flag changes nothing (idempotent). */
const sameFailure = (application: Application, check: CheckRun): boolean =>
  !check.result.ok && application.reason === check.result.reason && storedTopChoice(application) === check.stored.topChoice;

/**
 * Re-check a waiting row. A pass promotes it with the campaign's resume; a failure with a new reason (or a new
 * top-choice flag) updates the reason. The status guard keeps a Skip or Approve the user made meanwhile.
 */
async function recheckWaiting(tx: DbClient, scope: PrepareScope, existing: Application, check: CheckRun, resumes: ResumeChoice): Promise<TxResult> {
  const current = await tx.application.findUniqueOrThrow({ where: { id: existing.id } });
  if (current.status !== "waiting" || sameFailure(current, check)) return { application: current, check: null, changed: false };
  const ok = check.result.ok;
  const data = { ...decisionData(scope, check, ok ? resumes.campaign : resumes.kept), ...(ok ? { resumeId: resumes.campaign.id } : {}) };
  const { count } = await tx.application.updateMany({ where: { id: current.id, userId: scope.user.id, status: "waiting" }, data });
  const application = await tx.application.findUniqueOrThrow({ where: { id: current.id } });
  if (count === 0) return { application, check: null, changed: false };
  await auditPrepared(tx, scope, application, check, true);
  return { application, check, changed: true };
}

/** Inside the transaction: count the week, check, and create or re-check. Serialized so the cap holds. */
async function decide(tx: DbClient, scope: PrepareScope, existing: Application | null, resumes: ResumeChoice): Promise<TxResult> {
  const check = await runCheck(tx, {
    userId: scope.user.id,
    job: scope.job,
    rule: scope.rule,
    timeZone: scope.user.timezone,
    now: scope.now,
  });
  if (existing) return recheckWaiting(tx, scope, existing, check, resumes);
  const application = await tx.application.create({
    data: { ...decisionData(scope, check, resumes.campaign), userId: scope.user.id, jobId: scope.job.id, resumeId: resumes.campaign.id },
  });
  await auditPrepared(tx, scope, application, check, false);
  return { application, check, changed: true };
}

async function blockForMissingResume(scope: PrepareScope): Promise<never> {
  await writeAudit(scope.user.id, scope.actor, "application.blocked", {
    jobId: scope.job.id,
    company: scope.job.company.name,
    title: scope.job.title,
    ok: false,
    reason: APPLICATION_REASONS.uploadResume,
  });
  throw new ApplicationError("no_resume", APPLICATION_REASONS.uploadResume);
}

/** New rows use the campaign's resume. A waiting row keeps its own unless a campaign decision promotes it. */
async function resumesFor(existing: Application | null, scope: PrepareScope): Promise<ResumeChoice | null> {
  const campaign = await pickResume(db, scope.user.id, scope.rule);
  if (!existing) return campaign ? { kept: campaign, campaign } : null;
  const kept = await db.resume.findUnique({ where: { id: existing.resumeId } });
  if (!kept) return null;
  return { kept, campaign: campaign ?? kept };
}

/** Run the transaction; a concurrent create of the same (userId, jobId) resolves to the winner's row. */
async function decideOnce(scope: PrepareScope, existing: Application | null, resumes: ResumeChoice): Promise<TxResult> {
  try {
    return await db.$transaction((tx) => decide(tx, scope, existing, resumes));
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
 * application comes back unchanged unless it is waiting and the rule check now passes (prepared) or now
 * fails for a different reason (still waiting, reason updated). A closed posting is never prepared.
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
  const scope: PrepareScope = { user, job, rule, now, actor: parsedActor };
  if (job.closedAt) throw new ApplicationError("closed", APPLICATION_REASONS.postingClosed);
  const resumes = await resumesFor(existing, scope);
  if (!resumes) return blockForMissingResume(scope);

  const outcome = await decideOnce(scope, existing, resumes);
  if (!outcome.changed) return { application: outcome.application, changed: false, referralDraftFor: null };

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
