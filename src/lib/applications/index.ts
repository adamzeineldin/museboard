import "server-only";
import type { Application } from "@/generated/prisma/client";
import { notImplemented } from "@/lib/not-implemented";
import type { Actor } from "@/lib/types";

// Contract: docs/ARCHITECTURE.md "Cross-module function contract". Implemented in milestone 5.

export interface EvaluationResult {
  ok: boolean;
  reason: string;
  topChoice?: true;
}

export type SubmissionPacketResult =
  | { allowed: true; packet: unknown; applyUrl: string }
  | { allowed: false; reason: string };

export interface WeeklyPassSummary {
  submitted: string[];
  waiting: string[];
  referralDrafts: string[];
}

/** Read-only rule check for one job, used by the Jobs feed and find_roles. */
export async function evaluateJobForUser(userId: string, jobId: string, now?: Date): Promise<EvaluationResult> {
  return notImplemented("evaluateJobForUser", userId, jobId, now);
}

export async function prepareApplication(
  userId: string,
  jobId: string,
  actor: Actor,
  now?: Date,
): Promise<Application> {
  return notImplemented("prepareApplication", userId, jobId, actor, now);
}

export async function approveWaiting(userId: string, applicationId: string): Promise<Application> {
  return notImplemented("approveWaiting", userId, applicationId);
}

export async function skipWaiting(userId: string, applicationId: string): Promise<Application> {
  return notImplemented("skipWaiting", userId, applicationId);
}

export async function getSubmissionPacket(
  userId: string,
  applicationId: string,
  now?: Date,
): Promise<SubmissionPacketResult> {
  return notImplemented("getSubmissionPacket", userId, applicationId, now);
}

export async function recordSubmission(
  userId: string,
  applicationId: string,
  actor: Actor,
  confirmationText?: string,
): Promise<Application> {
  return notImplemented("recordSubmission", userId, applicationId, actor, confirmationText);
}

export async function runWeeklyPass(userId: string, actor: Actor, now?: Date): Promise<WeeklyPassSummary> {
  return notImplemented("runWeeklyPass", userId, actor, now);
}

/** Applications committed to go out this ISO week (submitted + prepared). See ARCHITECTURE "weekCount". */
export async function weekCount(
  userId: string,
  now: Date,
  timeZone: string,
  excludeApplicationId?: string,
): Promise<number> {
  return notImplemented("weekCount", userId, now, timeZone, excludeApplicationId);
}
