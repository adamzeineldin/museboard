import "server-only";
import { z } from "zod";
import type { Application } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseApplicationPacket, type ApplicationPacket } from "@/lib/packet-types";
import type { Actor } from "@/lib/types";
import { parseActorOrThrow } from "./client";
import { loadEvalContext, loadJobOrThrow } from "./context";
import { loadOwnedApplication } from "./decide";
import { ApplicationError, isApplicationError } from "./errors";
import { buildApplicationPacket } from "./packet";
import { releaseVerdict, statusRefusal, type ReleaseVerdict } from "./release";
import type { SubmissionPacketResult } from "./types";

export const CONFIRMATION_MAX = 2000;

const confirmationSchema = z
  .string()
  .trim()
  .max(CONFIRMATION_MAX, `Keep the confirmation under ${CONFIRMATION_MAX} characters.`)
  .optional();

/** prepared AND (approved by the user OR the rule check passes right now). See ./release.ts. */
async function decideRelease(userId: string, application: Application, now: Date): Promise<ReleaseVerdict> {
  const refusal = statusRefusal(application);
  if (refusal) return { allowed: false, reason: refusal };
  return releaseVerdict(await loadEvalContext(db, userId), application, now);
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

/** Mark that this decision's packet went out (first release only). recordSubmission relies on it. */
async function markReleased(userId: string, applicationId: string, now: Date): Promise<void> {
  await db.application.updateMany({
    where: { id: applicationId, userId, status: "prepared", packetReleasedAt: null },
    data: { packetReleasedAt: now },
  });
}

/**
 * Release the packet and apply URL only when the application may go out right now (brief sec. 6,
 * submit_application). Both outcomes are audited. `actor` defaults to 'inroad' (Inroad decides).
 * A release stamps Application.packetReleasedAt, which lets the submission be recorded later.
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
  if (!decision.allowed) return { allowed: false, reason: decision.reason };
  const { packet, applyUrl } = await packetFor(userId, application);
  await markReleased(userId, application.id, now);
  return { allowed: true, packet, applyUrl };
}

type SubmissionGate = { allowed: true; basis: "packet_released" | "release_check" } | { allowed: false; reason: string };

/**
 * May this prepared application be recorded as submitted? Yes if its packet was released for the current
 * decision (Muse can only submit with the packet, so that submission is a true event even if the campaign
 * was paused or edited since), or if the release check allows it right now. Never for anything else.
 */
async function submissionGate(userId: string, application: Application, now: Date): Promise<SubmissionGate> {
  const refusal = statusRefusal(application);
  if (refusal) return { allowed: false, reason: refusal };
  if (application.packetReleasedAt) return { allowed: true, basis: "packet_released" };
  const verdict = await decideRelease(userId, application, now);
  return verdict.allowed ? { allowed: true, basis: "release_check" } : { allowed: false, reason: verdict.reason };
}

const asSentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

async function refuseRecording(userId: string, actor: Actor, application: Application, reason: string): Promise<never> {
  await writeAudit(userId, actor, "application.record_refused", {
    applicationId: application.id,
    jobId: application.jobId,
    status: application.status,
    reason,
  });
  throw new ApplicationError(
    "not_released",
    `Inroad won't record this submission: ${asSentence(reason)} Its packet was never released, so nothing was recorded.`,
    reason,
  );
}

/**
 * prepared -> submitted (idempotent when already submitted). Records what Muse or the user reported, only
 * when submissionGate allows it; a refusal throws ApplicationError 'not_released' and is audited as
 * 'application.record_refused'. Web and MCP share this check. `now` is the clock for the release check
 * and the submittedAt stamp, so the row counts in the same week the gate checked.
 */
export async function recordSubmission(
  userId: string,
  applicationId: string,
  actor: Actor,
  confirmationText?: string,
  now: Date = new Date(),
): Promise<Application> {
  const parsedActor = parseActorOrThrow(actor);
  const confirmation = confirmationSchema.safeParse(confirmationText ?? undefined);
  if (!confirmation.success) throw new ApplicationError("invalid_input", confirmation.error.issues[0].message);
  const application = await loadOwnedApplication(userId, applicationId);
  if (application.status === "submitted") return application;
  const gate = await submissionGate(userId, application, now);
  if (!gate.allowed) return refuseRecording(userId, parsedActor, application, gate.reason);
  const text = confirmation.data ? confirmation.data : null;
  // Expected outcomes never throw inside the transaction: the state change and its audit commit together.
  const updated = await db.$transaction(async (tx) => {
    const { count } = await tx.application.updateMany({
      where: { id: application.id, userId, status: "prepared" },
      data: { status: "submitted", submittedAt: now, confirmationText: text },
    });
    if (count === 0) return null;
    const row = await tx.application.findUniqueOrThrow({ where: { id: application.id } });
    await writeAudit(
      userId,
      parsedActor,
      "application.submitted",
      { applicationId: row.id, jobId: row.jobId, decidedBy: row.decidedBy, allowedBy: gate.basis, hasConfirmation: text !== null },
      tx,
    );
    return row;
  });
  if (updated) return updated;
  // Lost a race: a concurrent call already recorded it (idempotent), or the row left 'prepared'.
  const current = await loadOwnedApplication(userId, application.id);
  if (current.status === "submitted") return current;
  throw new ApplicationError("invalid_state", "Only applications that are ready to submit can be marked submitted.");
}
