import type { RuleCheckResult } from "@/lib/rules";
import type { Actor } from "@/lib/types";

/** Stored in Application.checkResult: the rule check that decided this application. */
export interface StoredCheckResult {
  ok: boolean;
  reason: string;
  topChoice: boolean;
  versionId: string | null;
  weekCount: number;
  score: number | null;
}

export type EvaluationResult = RuleCheckResult;

export type SubmissionPacketResult<P = unknown> =
  | { allowed: true; packet: P; applyUrl: string }
  | { allowed: false; reason: string };

export interface WeeklyPassSummary {
  /** "Company · Title" of applications the pass cleared to submit (status prepared). */
  submitted: string[];
  /** "Company · Title" of applications the pass held for the user. */
  waiting: string[];
  /** "Company · Title" of jobs a referral ask was drafted for. */
  referralDrafts: string[];
  /** Set when the pass did not run (e.g. "Campaign is paused"). */
  reason?: string;
  /** "Company · Title" of jobs that failed to prepare (logged). */
  failed?: string[];
}

export type { Actor };
