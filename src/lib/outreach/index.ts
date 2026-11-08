import "server-only";
import type { Contact, Outreach } from "@/generated/prisma/client";
import { notImplemented } from "@/lib/not-implemented";
import type { OutreachKind } from "@/lib/types";

// Contract: docs/ARCHITECTURE.md "Cross-module function contract". Implemented in milestone 6.
// Inroad only drafts outreach; it never sends anything (ground rule 4).

export interface DraftOutreachResult {
  outreach: Outreach;
  draft: string;
  packet: unknown;
}

export async function bestContactAt(userId: string, companyId: string): Promise<Contact | null> {
  return notImplemented("bestContactAt", userId, companyId);
}

export async function createReferralAskDraft(userId: string, contactId: string, jobId?: string): Promise<Outreach> {
  return notImplemented("createReferralAskDraft", userId, contactId, jobId);
}

export async function draftOutreach(
  userId: string,
  contactId: string,
  kind: OutreachKind,
  jobId?: string,
): Promise<DraftOutreachResult> {
  return notImplemented("draftOutreach", userId, contactId, kind, jobId);
}
