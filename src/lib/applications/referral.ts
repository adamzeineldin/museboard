import "server-only";
import type { Application } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/types";
import { errorMessage } from "./client";
import { bestContactAt, createReferralAskDraft } from "./deps";
import type { JobWithCompany } from "./packet";

/**
 * Top choice (brief sec. 4): draft a referral ask for the best contact at the company, unless one
 * already exists for that contact and job. Inroad only drafts; the user sends it (ground rule 4).
 * Returns the contact's name when a draft was created. A failure is logged and audited, and does not
 * undo the application, which is already saved as waiting.
 */
export async function draftReferralIfNeeded(
  actor: Actor,
  application: Application,
  job: JobWithCompany,
): Promise<string | null> {
  const userId = application.userId;
  try {
    const contact = await bestContactAt(userId, job.companyId);
    if (!contact) return null;
    const existing = await db.outreach.findFirst({
      where: { userId, contactId: contact.id, jobId: job.id, kind: "referral_ask" },
      select: { id: true },
    });
    if (existing) return null;
    const outreach = await createReferralAskDraft(userId, contact.id, job.id, actor);
    await writeAudit(userId, actor, "application.referral_drafted", {
      applicationId: application.id,
      jobId: job.id,
      contactId: contact.id,
      contactName: contact.name,
      outreachId: outreach.id,
    });
    return contact.name;
  } catch (error) {
    console.error("[applications] referral draft failed", { userId, jobId: job.id, error: errorMessage(error) });
    await writeAudit(userId, "inroad", "application.referral_draft_failed", {
      applicationId: application.id,
      jobId: job.id,
      reason: "Couldn't draft a referral ask",
    });
    return null;
  }
}
