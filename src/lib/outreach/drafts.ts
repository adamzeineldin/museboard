import "server-only";
import type { Outreach, Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { ReferralPacket } from "@/lib/packet-types";
import type { Actor, OutreachKind } from "@/lib/types";
import { OutreachError, draftNotFound } from "./errors";
import { buildPacketContext } from "./packet";
import { draftRequestSchema, markSentSchema } from "./schemas";
import { composeDraft, draftFitLine } from "./templates";

// Outreach drafts. Inroad only drafts: it never sends anything. The user copies the text, sends it from their
// own account, and flips "Mark as sent" themselves (ground rule 4).

export interface DraftOutreachResult {
  outreach: Outreach;
  draft: string;
  packet: ReferralPacket;
}

export interface OutreachPreview {
  draft: string;
  packet: ReferralPacket;
  companyId: string;
  jobId: string | null;
}

export type OutreachWithJob = Prisma.OutreachGetPayload<{ include: { job: { select: { id: true; title: true } } } }>;

function parseRequest(contactId: string, kind: OutreachKind, jobId?: string) {
  const parsed = draftRequestSchema.safeParse({ contactId, kind, jobId });
  if (!parsed.success) throw new OutreachError("invalid", "That draft request isn't valid.");
  return parsed.data;
}

/** Generate the draft text and packet without saving anything. */
export async function previewOutreach(userId: string, contactId: string, kind: OutreachKind, jobId?: string): Promise<OutreachPreview> {
  const request = parseRequest(contactId, kind, jobId);
  const [context, sender] = await Promise.all([
    buildPacketContext(userId, request.contactId, request.jobId),
    db.user.findUnique({ where: { id: userId }, select: { name: true, school: true } }),
  ]);
  const draft = composeDraft({
    kind: request.kind,
    contact: context.contact,
    companyName: context.contact.company.name,
    job: context.job ? { title: context.job.title } : null,
    fitLine: context.hasResumeText ? draftFitLine(context.packet.fitSummary[0]) : null,
    sender: { name: sender?.name ?? null, school: sender?.school ?? null },
  });
  return { draft, packet: context.packet, companyId: context.contact.companyId, jobId: context.job?.id ?? null };
}

/** Create an Outreach draft (status 'draft') and return it with its text and referral packet. */
export async function draftOutreach(
  userId: string,
  contactId: string,
  kind: OutreachKind,
  jobId?: string,
  actor: Actor = "user",
): Promise<DraftOutreachResult> {
  const preview = await previewOutreach(userId, contactId, kind, jobId);
  const outreach = await db.outreach.create({
    data: { userId, contactId, jobId: preview.jobId, companyId: preview.companyId, kind, draft: preview.draft, status: "draft" },
  });
  await writeAudit(userId, actor, "outreach.drafted", { outreachId: outreach.id, contactId, jobId: preview.jobId, kind });
  return { outreach, draft: preview.draft, packet: preview.packet };
}

/**
 * Referral ask used when a top-choice company is held ("Top choice: referral first"). Idempotent: if a
 * referral_ask already exists for this contact and job it is returned instead of creating another.
 */
export async function createReferralAskDraft(userId: string, contactId: string, jobId?: string, actor: Actor = "inroad"): Promise<Outreach> {
  const request = parseRequest(contactId, "referral_ask", jobId);
  const existing = await db.outreach.findFirst({
    where: { userId, contactId: request.contactId, jobId: request.jobId ?? null, kind: "referral_ask" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return (await draftOutreach(userId, request.contactId, "referral_ask", request.jobId, actor)).outreach;
}

/** The user's own "Mark as sent" toggle. sent=false returns the draft to 'draft' and clears sentAt. */
export async function setOutreachSent(userId: string, outreachId: string, sent: boolean, now: Date = new Date()): Promise<Outreach> {
  const parsed = markSentSchema.safeParse({ outreachId, sent });
  if (!parsed.success) throw new OutreachError("invalid", "That update isn't valid.");
  const existing = await db.outreach.findFirst({ where: { id: parsed.data.outreachId, userId } });
  if (!existing) throw draftNotFound();
  const updated = await db.outreach.update({
    where: { id: existing.id },
    data: parsed.data.sent ? { status: "sent_by_user", sentAt: now } : { status: "draft", sentAt: null },
  });
  await writeAudit(userId, "user", parsed.data.sent ? "outreach.marked_sent" : "outreach.marked_draft", {
    outreachId: existing.id,
    contactId: existing.contactId,
    kind: existing.kind,
  });
  return updated;
}

/** Drafts for one contact, newest first. Empty for a contact the user doesn't own. */
export async function listOutreachForContact(userId: string, contactId: string): Promise<OutreachWithJob[]> {
  return db.outreach.findMany({
    where: { userId, contactId },
    include: { job: { select: { id: true, title: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}
