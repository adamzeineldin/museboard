import "server-only";
import { db } from "@/lib/db";
import { bestContactAt, listContacts, listOutreachForContact, previewOutreach, userMessage, type ContactWithCompany, type OutreachWithJob } from "@/lib/outreach";
import type { ReferralPacket } from "@/lib/packet-types";
import type { OutreachKind, OutreachStatus } from "@/lib/types";
import { initials, pickJobId, type WarmPathParams } from "./selection";

// Read-only view model for /warm-paths. Nothing here writes: previews are generated, not saved, so link
// prefetching can never create drafts. Everything is plain data so it can cross into client components.

const MAX_JOBS = 50;

export interface ContactView {
  id: string;
  name: string;
  initials: string;
  role: string;
  company: string;
  companyId: string;
  relationship: string;
  notes: string | null;
  email: string | null;
  source: string;
}

export interface OutreachView {
  id: string;
  kind: OutreachKind;
  jobId: string | null;
  jobTitle: string | null;
  status: OutreachStatus;
  draft: string;
  createdAt: string;
  sentAt: string | null;
}

export interface SelectedView {
  contact: ContactView;
  kind: OutreachKind;
  jobs: Array<{ id: string; title: string }>;
  jobId: string | null;
  /** Text shown in the panel: the newest saved draft for this contact/job/kind, else a fresh preview. */
  draftText: string | null;
  /** The saved draft being shown, when there is one. */
  saved: OutreachView | null;
  packet: ReferralPacket | null;
  draftError: string | null;
  history: OutreachView[];
}

export interface WarmPathsView {
  contacts: ContactView[];
  selected: SelectedView | null;
  notice: string | null;
}

function toContactView(contact: ContactWithCompany): ContactView {
  return {
    id: contact.id,
    name: contact.name,
    initials: initials(contact.name),
    role: contact.role,
    company: contact.company.name,
    companyId: contact.companyId,
    relationship: contact.relationship,
    notes: contact.notes,
    email: contact.email,
    source: contact.source,
  };
}

function toOutreachView(outreach: OutreachWithJob): OutreachView {
  return {
    id: outreach.id,
    kind: outreach.kind as OutreachKind,
    jobId: outreach.jobId,
    jobTitle: outreach.job?.title ?? null,
    status: outreach.status as OutreachStatus,
    draft: outreach.draft,
    createdAt: outreach.createdAt.toISOString(),
    sentAt: outreach.sentAt?.toISOString() ?? null,
  };
}

async function chooseContact(userId: string, contacts: ContactWithCompany[], params: WarmPathParams) {
  if (params.contactId) {
    const match = contacts.find((c) => c.id === params.contactId);
    if (match) return { contact: match, notice: null };
    return { contact: contacts[0], notice: "That contact isn't in your list, so here is your first one." };
  }
  if (params.jobId) {
    const job = await db.job.findUnique({ where: { id: params.jobId }, select: { companyId: true } });
    const best = job ? await bestContactAt(userId, job.companyId) : null;
    const match = best ? contacts.find((c) => c.id === best.id) : undefined;
    if (match) return { contact: match, notice: null };
  }
  return { contact: contacts[0], notice: null };
}

export async function loadWarmPathsView(userId: string, params: WarmPathParams): Promise<WarmPathsView> {
  const contacts = await listContacts(userId);
  if (contacts.length === 0) return { contacts: [], selected: null, notice: null };

  const { contact, notice } = await chooseContact(userId, contacts, params);
  const [jobs, history] = await Promise.all([
    db.job.findMany({
      where: { companyId: contact.companyId, closedAt: null },
      select: { id: true, title: true },
      orderBy: [{ postedAt: "desc" }, { firstSeenAt: "desc" }, { id: "asc" }],
      take: MAX_JOBS,
    }),
    listOutreachForContact(userId, contact.id),
  ]);
  const jobId = pickJobId(jobs, params.jobId);
  const historyViews = history.map(toOutreachView);
  const saved = historyViews.find((o) => o.kind === params.kind && o.jobId === jobId) ?? null;

  let draftText: string | null = saved?.draft ?? null;
  let packet: ReferralPacket | null = null;
  let draftError: string | null = null;
  try {
    const preview = await previewOutreach(userId, contact.id, params.kind, jobId ?? undefined);
    draftText = saved?.draft ?? preview.draft;
    packet = preview.packet;
  } catch (error) {
    console.error("[warm-paths] preview failed", { userId, contactId: contact.id, error: error instanceof Error ? error.message : error });
    draftError = userMessage(error, "We couldn't build this draft right now. Try again in a moment.");
  }

  return {
    contacts: contacts.map(toContactView),
    notice,
    selected: { contact: toContactView(contact), kind: params.kind, jobs, jobId, draftText, saved, packet, draftError, history: historyViews },
  };
}
