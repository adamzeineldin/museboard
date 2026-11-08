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

/** Waiting -> prepared, decided by the user. Builds the packet so it is ready to submit. */
export async function approveWaiting(userId: string, applicationId: string, now: Date = new Date()): Promise<Application> {
  const application = await loadOwnedApplication(userId, applicationId);
  if (application.status === "prepared" && application.decidedBy === "user") return application;
  if (application.status !== "waiting") throw notWaiting("approved");

  const [user, job, resume] = await Promise.all([
    loadUserOrThrow(db, userId),
    loadJobOrThrow(db, application.jobId),
    db.resume.findUnique({ where: { id: application.resumeId } }),
  ]);
  const updated = await db.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: { id: application.id, userId, status: "waiting" },
      data: {
        status: "prepared",
        decidedBy: "user",
        reason: APPLICATION_REASONS.approvedByYou,
        decidedAt: now,
        packet: toJson(buildApplicationPacket(user, job, resume)),
      },
    });
    if (count === 0) throw notWaiting("approved");
    return tx.application.findUniqueOrThrow({ where: { id: application.id } });
  });
  await writeAudit(userId, "user", "application.approved", {
    applicationId: updated.id,
    jobId: updated.jobId,
    previousReason: application.reason,
    reason: updated.reason,
  });
  return updated;
}

/** Waiting -> skipped, decided by the user. */
export async function skipWaiting(userId: string, applicationId: string): Promise<Application> {
  const application = await loadOwnedApplication(userId, applicationId);
  if (application.status === "skipped") return application;
  if (application.status !== "waiting") throw notWaiting("skipped");

  const updated = await db.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: { id: application.id, userId, status: "waiting" },
      data: { status: "skipped", decidedBy: "user", reason: APPLICATION_REASONS.skippedByYou, decidedAt: new Date() },
    });
    if (count === 0) throw notWaiting("skipped");
    return tx.application.findUniqueOrThrow({ where: { id: application.id } });
  });
  await writeAudit(userId, "user", "application.skipped", {
    applicationId: updated.id,
    jobId: updated.jobId,
    previousReason: application.reason,
    reason: updated.reason,
  });
  return updated;
}
