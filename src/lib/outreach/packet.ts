import "server-only";
import type { Job } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ReferralPacket } from "@/lib/packet-types";
import { requireContact, type ContactWithCompany } from "./contacts";
import { fitSummary, getDefaultResume, resumeDownloadPath } from "./deps";
import { OutreachError, jobNotFound } from "./errors";

// The referral packet a contact gets: the role (with posting link), a three-line fit summary and the resume.
// Shape: docs/ARCHITECTURE.md "Packets".

export interface PacketContext {
  contact: ContactWithCompany;
  job: Job | null;
  packet: ReferralPacket;
  /** True when the fit summary is backed by resume text (drafts only quote it then). */
  hasResumeText: boolean;
}

/** The job, checked to be at the contact's company. */
export async function requireJobAtCompany(jobId: string, contact: ContactWithCompany): Promise<Job> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw jobNotFound();
  if (job.companyId !== contact.companyId) throw new OutreachError("invalid", `That job isn't at ${contact.company.name}.`);
  return job;
}

export async function buildPacketContext(userId: string, contactId: string, jobId: string | null | undefined): Promise<PacketContext> {
  const contact = await requireContact(userId, contactId);
  const job = jobId ? await requireJobAtCompany(jobId, contact) : null;
  const resume = await getDefaultResume(userId);
  const resumeText = resume?.parsedText ?? "";
  const companyName = contact.company.name;
  const lines = fitSummary(resumeText, {
    title: job?.title ?? `Software engineering roles at ${companyName}`,
    description: job?.description ?? null,
    companyName,
  });

  const packet: ReferralPacket = {
    role: job ? { jobId: job.id, title: job.title, company: companyName, url: job.url } : null,
    fitSummary: [lines[0], lines[1], lines[2]],
    resume: resume ? { id: resume.id, filename: resume.filename, downloadPath: resumeDownloadPath(resume.id) } : null,
  };
  return { contact, job, packet, hasResumeText: resumeText.trim().length > 0 };
}

export async function buildReferralPacket(userId: string, jobId: string | null, contactId: string): Promise<ReferralPacket> {
  return (await buildPacketContext(userId, contactId, jobId)).packet;
}
