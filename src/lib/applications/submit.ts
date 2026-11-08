import "server-only";
import { z } from "zod";
import type { Application } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseApplicationPacket, type ApplicationPacket } from "@/lib/packet-types";
import { RULE_REASONS } from "@/lib/rules";
import type { Actor } from "@/lib/types";
import { parseActorOrThrow } from "./client";
import { loadEvalContext, loadJobOrThrow, runCheck } from "./context";
import { loadOwnedApplication } from "./decide";
import { APPLICATION_REASONS, ApplicationError, isApplicationError } from "./errors";
import { buildApplicationPacket } from "./packet";
import type { SubmissionPacketResult } from "./types";

export const CONFIRMATION_MAX = 2000;

const confirmationSchema = z
  .string()
  .trim()
  .max(CONFIRMATION_MAX, `Keep the confirmation under ${CONFIRMATION_MAX} characters.`)
  .optional();

type Decision = { allowed: true; reason: string } | { allowed: false; reason: string };

function statusRefusal(application: Application): string | null {
  if (application.status === "submitted") return "Already submitted.";
  if (application.status === "skipped") return "You skipped this application.";
  if (application.status !== "prepared") return `Waiting on your approval: ${application.reason}`;
  return null;
}

/** prepared AND (approved by the user OR the rule check passes right now, not counting itself). */
async function decideRelease(userId: string, application: Application, now: Date): Promise<Decision> {
  const refusal = statusRefusal(application);
  if (refusal) return { allowed: false, reason: refusal };
  if (application.decidedBy === "user") return { allowed: true, reason: APPLICATION_REASONS.approvedByYou };
  const [{ user, rule }, job] = await Promise.all([loadEvalContext(db, userId), loadJobOrThrow(db, application.jobId)]);
  const { result } = await runCheck(db, {
    userId,
    job,
    rule,
    timeZone: user.timezone,
    now,
    excludeApplicationId: application.id,
  });
  return result.ok ? { allowed: true, reason: RULE_REASONS.fits } : { allowed: false, reason: result.reason };
}

async function packetFor(userId: string, application: Application): Promise<{ packet: ApplicationPacket; applyUrl: string }> {
  const job = await loadJobOrThrow(db, application.jobId);
  const stored = parseApplicationPacket(application.packet);
  if (stored) return { packet: stored, applyUrl: job.url };
  const [{ user }, resume] = await Promise.all([
    loadEvalContext(db, userId),
    db.resume.findUnique({ where: { id: application.resumeId } }),
  ]);
  return { packet: buildApplicationPacket(user, job, resume), applyUrl: job.url };
}

/**
 * Release the packet and apply URL only when the application may go out right now (brief sec. 6,
 * submit_application). Both outcomes are audited. `actor` defaults to 'inroad' (Inroad decides).
 */
export async function getSubmissionPacket(
  userId: string,
  applicationId: string,
  now: Date = new Date(),
  actor: Actor = "inroad",
): Promise<SubmissionPacketResult<ApplicationPacket>> {
  const parsedActor = parseActorOrThrow(actor);
  let application: Application;
  try {
    application = await loadOwnedApplication(userId, applicationId);
  } catch (error) {
    if (!isApplicationError(error)) throw error;
    await writeAudit(userId, parsedActor, "application.packet_requested", { applicationId, allowed: false, reason: error.message });
    return { allowed: false, reason: error.message };
  }
  const decision = await decideRelease(userId, application, now);
  await writeAudit(userId, parsedActor, "application.packet_requested", {
    applicationId: application.id,
    jobId: application.jobId,
    allowed: decision.allowed,
    reason: decision.reason,
  });
  if (!decision.allowed) return decision;
  const { packet, applyUrl } = await packetFor(userId, application);
  return { allowed: true, packet, applyUrl };
}

/** prepared -> submitted (idempotent when already submitted). Records what Muse or the user reported. */
export async function recordSubmission(
  userId: string,
  applicationId: string,
  actor: Actor,
  confirmationText?: string,
): Promise<Application> {
  const parsedActor = parseActorOrThrow(actor);
  const confirmation = confirmationSchema.safeParse(confirmationText ?? undefined);
  if (!confirmation.success) throw new ApplicationError("invalid_input", confirmation.error.issues[0].message);
  const application = await loadOwnedApplication(userId, applicationId);
  if (application.status === "submitted") return application;
  const notReady = () =>
    new ApplicationError("invalid_state", "Only applications that are ready to submit can be marked submitted.");
  if (application.status !== "prepared") throw notReady();

  const text = confirmation.data ? confirmation.data : null;
  const updated = await db.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: { id: application.id, userId, status: "prepared" },
      data: { status: "submitted", submittedAt: new Date(), confirmationText: text },
    });
    if (count === 0) throw notReady();
    return tx.application.findUniqueOrThrow({ where: { id: application.id } });
  });
  await writeAudit(userId, parsedActor, "application.submitted", {
    applicationId: updated.id,
    jobId: updated.jobId,
    decidedBy: updated.decidedBy,
    hasConfirmation: text !== null,
  });
  return updated;
}
