import "server-only";
import type { Application } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseIdOrThrow } from "./client";
import { loadJobOrThrow, loadUserOrThrow, toJson } from "./context";
import { APPLICATION_REASONS, ApplicationError } from "./errors";
import { buildApplicationPacket } from "./packet";

/** The user's own application, or a not-found error (never reveals other users' rows). */
export async function loadOwnedApplication(userId: string, applicationId: unknown): Promise<Application> {
  const id = parseIdOrThrow(applicationId, "application");
  const application = await db.application.findFirst({ where: { id, userId } });
  if (!application) throw new ApplicationError("not_found", "We couldn't find that application.");
  return application;
}

const notWaiting = (verb: string) =>
  new ApplicationError("invalid_state", `Only applications waiting on you can be ${verb}.`);

/** After a lost race (count 0): the row as it is now, if it already reached `status`, else the refusal. */
async function settledOrThrow(userId: string, applicationId: string, isSettled: (row: Application) => boolean, verb: string): Promise<Application> {
  const current = await loadOwnedApplication(userId, applicationId);
  if (isSettled(current)) return current;
  throw notWaiting(verb);
}

const isUserApproved = (row: Application): boolean => row.status === "prepared" && row.decidedBy === "user";
const isSkipped = (row: Application): boolean => row.status === "skipped";

/** Waiting -> prepared, decided by the user. Builds the packet so it is ready to submit. */
export async function approveWaiting(userId: string, applicationId: string, now: Date = new Date()): Promise<Application> {
  const application = await loadOwnedApplication(userId, applicationId);
  if (isUserApproved(application)) return application;
  if (application.status !== "waiting") throw notWaiting("approved");

  const [user, job, resume] = await Promise.all([
    loadUserOrThrow(db, userId),
    loadJobOrThrow(db, application.jobId),
    db.resume.findUnique({ where: { id: application.resumeId } }),
  ]);
  if (job.closedAt) throw new ApplicationError("closed", APPLICATION_REASONS.postingClosed);
  // Expected outcomes never throw inside the transaction: the state change and its audit commit together.
  const updated = await db.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: { id: application.id, userId, status: "waiting" },
      data: {
        status: "prepared",
        decidedBy: "user",
        reason: APPLICATION_REASONS.approvedByYou,
        decidedAt: now,
        packetReleasedAt: null,
        packet: toJson(buildApplicationPacket(user, job, resume)),
      },
    });
    if (count === 0) return null;
    const row = await tx.application.findUniqueOrThrow({ where: { id: application.id } });
    await writeAudit(
      userId,
      "user",
      "application.approved",
      { applicationId: row.id, jobId: row.jobId, previousReason: application.reason, reason: row.reason },
      tx,
    );
    return row;
  });
  return updated ?? settledOrThrow(userId, application.id, isUserApproved, "approved");
}

/** Waiting -> skipped, decided by the user. `now` stamps decidedAt. */
export async function skipWaiting(userId: string, applicationId: string, now: Date = new Date()): Promise<Application> {
  const application = await loadOwnedApplication(userId, applicationId);
  if (isSkipped(application)) return application;
  if (application.status !== "waiting") throw notWaiting("skipped");

  const updated = await db.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: { id: application.id, userId, status: "waiting" },
      data: { status: "skipped", decidedBy: "user", reason: APPLICATION_REASONS.skippedByYou, decidedAt: now, packetReleasedAt: null },
    });
    if (count === 0) return null;
    const row = await tx.application.findUniqueOrThrow({ where: { id: application.id } });
    await writeAudit(
      userId,
      "user",
      "application.skipped",
      { applicationId: row.id, jobId: row.jobId, previousReason: application.reason, reason: row.reason },
      tx,
    );
    return row;
  });
  return updated ?? settledOrThrow(userId, application.id, isSkipped, "skipped");
}
