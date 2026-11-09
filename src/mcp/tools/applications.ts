import "server-only";
import { z } from "zod";
import type { Application } from "@/generated/prisma/client";
import { checkRelease, CONFIRMATION_MAX, getSubmissionPacket, prepareApplication, recordSubmission } from "@/lib/applications";
import { ApplicationPacketSchema } from "@/lib/packet-types";
import { ToolRefusal } from "../errors";
import { ApplicationStatusOutput, idSchema, isoString } from "../schemas";
import { defineTool } from "../tool-kit";

// Application tools: prepare_application (Write), submit_application (Sensitive write), record_submission (Write).
// Inroad never submits an application itself: Muse's own browser agent fills the form under Muse's controls.
// prepare_application never returns the packet or apply URL: Muse asks once for a Write tool, so the packet goes out
// only through submit_application, the Sensitive write Muse confirms on every call (ground rule 2).

const RULE_SUMMARY =
  "the user's approved campaign rules at this moment (campaign active and not ended, company on the auto-apply list, role type, minimum match, weekly limit)";

type ApplicationStatus = z.output<typeof ApplicationStatusOutput>;

const SUBMIT_NEXT_STEP = "To get the packet and application URL, call submit_application with this applicationId.";

const topChoiceOf = (application: Application): boolean =>
  z.object({ topChoice: z.boolean() }).safeParse(application.checkResult).data?.topChoice ?? false;

/** The text Muse relays; a skipped row is final, so it must not read as waiting on the user. */
function prepareSummary(status: ApplicationStatus, ok: boolean, heldReason: string | null, reason: string): string {
  if (heldReason !== null) return `Application is held, nothing is released: ${heldReason}.`;
  if (ok) return `Application is ${status}: ${reason}. ${SUBMIT_NEXT_STEP}`;
  if (status === "skipped") return "The user skipped this application; nothing will be prepared.";
  return `Application is waiting on the user: ${reason}.`;
}

export const prepareApplicationTool = defineTool({
  name: "prepare_application",
  title: "Prepare application",
  museClass: "write",
  description: [
    "Muse class: Write. Side effect: creates an application record in Inroad for one job (jobId from find_roles) with an audit entry; it does not submit anything.",
    `Runs the rule check against ${RULE_SUMMARY}.`,
    "If it passes, the application is prepared (cleared to submit) and nextStep says to call submit_application, the only tool that returns the packet and application URL.",
    "If not, the application waits for the user to approve or skip it in Inroad, and the reason is returned (for a top-choice company Inroad also drafts a referral ask, never sent).",
    "Calling it again for the same job returns the existing application, re-checked only while it is waiting (a pass prepares it with the campaign's resume; a new failing reason updates the reason); a prepared application that the rules no longer allow comes back held.",
    "A posting that has closed is refused with an error.",
  ].join(" "),
  input: z.strictObject({ jobId: idSchema("jobId") }),
  hints: { destructiveHint: false, idempotentHint: true },
  output: z.object({
    applicationId: z.string(),
    jobId: z.string(),
    status: ApplicationStatusOutput,
    decidedBy: z.string(),
    ok: z.boolean(),
    reason: z.string(),
    topChoice: z.boolean(),
    nextStep: z.string().nullable(),
  }),
  auditArgs: (input) => ({ jobId: input.jobId }),
  async run(ctx, input) {
    const application = await prepareApplication(ctx.userId, input.jobId, "muse", ctx.now());
    const status = ApplicationStatusOutput.parse(application.status);
    // A prepared row is returned as-is on a repeat call, so re-run the release check: it reads as cleared only
    // while submit_application would release it right now (same verdict as find_roles' "Held: ..." rows).
    const release = status === "prepared" ? await checkRelease(ctx.userId, application.id, ctx.now()) : null;
    const held = release !== null && !release.allowed;
    const ok = !held && (status === "prepared" || status === "submitted");
    const reason = held ? `Held: ${release.reason}` : application.reason;
    return {
      data: {
        applicationId: application.id,
        jobId: application.jobId,
        status,
        decidedBy: application.decidedBy,
        ok,
        reason,
        topChoice: topChoiceOf(application),
        nextStep: ok && status === "prepared" ? SUBMIT_NEXT_STEP : null,
      },
      summary: prepareSummary(status, ok, held ? release.reason : null, application.reason),
    };
  },
});

export const submitApplicationTool = defineTool({
  name: "submit_application",
  title: "Get application packet to submit",
  museClass: "sensitive_write",
  description: [
    "Muse class: Sensitive write. Side effects: records in Inroad's audit log that the packet was requested, and, when the packet is returned, marks this application's packet as released,",
    "so record_submission can record it later even if the campaign is paused or its rules are edited afterwards. Inroad submits nothing.",
    "Returns the prepared application packet (resume, answers to common fields, tailored summary, and notes on fields only the user can answer) and the job's application URL,",
    `only if this application may go out right now: the posting is still open, and the user approved it in Inroad or it passes ${RULE_SUMMARY}.`,
    "Otherwise it returns an error with the reason and releases nothing.",
    "Filling in and sending the employer's form happens in Muse's own browser agent, under Muse's own controls and the user's approval. After the form is sent, call record_submission.",
  ].join(" "),
  input: z.strictObject({ applicationId: idSchema("applicationId") }),
  hints: { destructiveHint: true, idempotentHint: true },
  output: z.object({ applicationId: z.string(), applyUrl: z.string(), packet: ApplicationPacketSchema, nextStep: z.string() }),
  auditArgs: (input) => ({ applicationId: input.applicationId }),
  async run(ctx, input) {
    const result = await getSubmissionPacket(ctx.userId, input.applicationId, ctx.now(), "muse");
    if (!result.allowed) throw new ToolRefusal(`Inroad won't release this application: ${result.reason}`);
    const nextStep = "After the employer's form is submitted, call record_submission with this applicationId.";
    return {
      data: { applicationId: input.applicationId, applyUrl: result.applyUrl, packet: result.packet, nextStep },
      summary: `Cleared to submit. Application URL: ${result.applyUrl}`,
    };
  },
});

export const recordSubmissionTool = defineTool({
  name: "record_submission",
  title: "Record submission",
  museClass: "write",
  description: [
    "Muse class: Write. Side effect: marks a prepared application as submitted in Inroad and writes an audit entry.",
    "Call it only after the employer's application form was actually sent. Optional confirmationText: the confirmation message or number the site showed.",
    "Inroad records it only if submit_application released this application's packet, or if it may go out right now (same check as submit_application);",
    "otherwise it returns an error with the reason and records nothing. A packet that was released stays recordable even if the campaign is paused or edited afterwards.",
    "Recording an already submitted application again changes nothing.",
  ].join(" "),
  input: z.strictObject({
    applicationId: idSchema("applicationId"),
    confirmationText: z.string().trim().max(CONFIRMATION_MAX).optional(),
  }),
  hints: { destructiveHint: false, idempotentHint: true },
  output: z.object({ applicationId: z.string(), status: z.literal("submitted"), submittedAt: isoString }),
  auditArgs: (input) => ({ applicationId: input.applicationId, hasConfirmation: Boolean(input.confirmationText) }),
  async run(ctx, input) {
    const application = await recordSubmission(ctx.userId, input.applicationId, "muse", input.confirmationText, ctx.now());
    if (application.status !== "submitted" || !application.submittedAt) {
      throw new ToolRefusal("Only applications that are ready to submit can be marked submitted.");
    }
    return {
      data: { applicationId: application.id, status: "submitted" as const, submittedAt: application.submittedAt.toISOString() },
      summary: "Marked the application as submitted.",
    };
  },
});
