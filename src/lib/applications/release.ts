import "server-only";
import type { Application } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { RULE_REASONS } from "@/lib/rules";
import { loadEvalContext, loadJobOrThrow, runCheck, type EvalContext } from "./context";
import { loadOwnedApplication } from "./decide";
import { APPLICATION_REASONS, isApplicationError } from "./errors";

// The release check (brief sec. 5.5 / 6): an application may go out only if the user approved it or the
// rule check passes right now. getSubmissionPacket (Muse) and the web (Activity, Jobs) share this code,
// so both always give the same verdict. Nothing here writes; getSubmissionPacket audits its own calls.

export interface ReleaseVerdict {
  allowed: boolean;
  reason: string;
}

/** Why a non-prepared application can't be released, or null when it is prepared. */
export function statusRefusal(application: Pick<Application, "status" | "reason">): string | null {
  if (application.status === "submitted") return "Already submitted.";
  if (application.status === "skipped") return "You skipped this application.";
  if (application.status !== "prepared") return `Waiting on your approval: ${application.reason}`;
  return null;
}

/** Verdict for one application with an already-loaded user + rule context. */
export async function releaseVerdict(context: EvalContext, application: Application, now: Date): Promise<ReleaseVerdict> {
  const refusal = statusRefusal(application);
  if (refusal) return { allowed: false, reason: refusal };
  if (application.decidedBy === "user") return { allowed: true, reason: APPLICATION_REASONS.approvedByYou };
  const job = await loadJobOrThrow(db, application.jobId);
  const { result } = await runCheck(db, {
    userId: context.user.id,
    job,
    rule: context.rule,
    timeZone: context.user.timezone,
    now,
    rankAgainst: application,
  });
  return result.ok ? { allowed: true, reason: RULE_REASONS.fits } : { allowed: false, reason: result.reason };
}

/** Read-only verdict for one of the user's applications (used before the web marks it submitted). */
export async function checkRelease(userId: string, applicationId: string, now: Date = new Date()): Promise<ReleaseVerdict> {
  try {
    const application = await loadOwnedApplication(userId, applicationId);
    return releaseVerdict(await loadEvalContext(db, userId), application, now);
  } catch (error) {
    if (isApplicationError(error)) return { allowed: false, reason: error.message };
    throw error;
  }
}

/** Read-only verdicts for every prepared application of the user, keyed by application id. */
export async function getReleaseVerdicts(userId: string, now: Date = new Date()): Promise<Map<string, ReleaseVerdict>> {
  const prepared = await db.application.findMany({ where: { userId, status: "prepared" }, orderBy: { createdAt: "asc" } });
  if (prepared.length === 0) return new Map();
  const context = await loadEvalContext(db, userId);
  const entries = await Promise.all(
    prepared.map(async (application) => [application.id, await releaseVerdict(context, application, now)] as const),
  );
  return new Map(entries);
}
