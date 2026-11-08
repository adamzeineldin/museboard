import "server-only";
import { db } from "@/lib/db";
import { parseIdOrThrow } from "./client";
import { loadEvalContext, loadJobOrThrow, runCheck } from "./context";
import type { EvaluationResult } from "./types";

/** Read-only rule check for one job, used by the Jobs feed and find_roles. Writes nothing. */
export async function evaluateJobForUser(userId: string, jobId: string, now: Date = new Date()): Promise<EvaluationResult> {
  const job = await loadJobOrThrow(db, parseIdOrThrow(jobId, "job"));
  const { user, rule } = await loadEvalContext(db, userId);
  const { result } = await runCheck(db, { userId, job, rule, timeZone: user.timezone, now });
  return result;
}
