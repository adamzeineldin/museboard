import type { DigestWeek } from "./week";

// Data the digest renderer needs. The loader (load.ts) fills it from the services and the database;
// the renderer (render.ts) is pure.

export const DIGEST_CAMPAIGN_KINDS = ["none", "not_approved", "active", "paused", "ended", "revoked"] as const;
export type DigestCampaignKind = (typeof DIGEST_CAMPAIGN_KINDS)[number];

export interface DigestRole {
  company: string;
  title: string;
  /** Submitted ("went out") or decided ("ready") time; null when unknown. */
  at: Date | null;
  /** Why it is waiting, or how it was cleared. */
  reason: string;
}

export interface DigestReferralDraft {
  contactName: string;
  company: string;
  title: string | null;
  createdAt: Date;
  /** The user marked it sent themselves. Inroad never sends. */
  markedSent: boolean;
}

export interface DigestList<T> {
  /** At most DIGEST_SECTION_LIMIT items, newest first. */
  items: readonly T[];
  /** Everything that matched, including items not listed. */
  total: number;
}

export interface DigestCampaign {
  kind: DigestCampaignKind;
  /** The live campaign's id (active or paused), used for the pause link. */
  campaignId: string | null;
  /** Applications committed to go out in the digest week (weekCount). */
  weekCount: number;
  weeklyCap: number | null;
  endsOn: string | null;
  /** Edited rules waiting for a new approval. */
  hasPendingChanges: boolean;
}

export interface DigestData {
  userId: string;
  firstName: string | null;
  week: DigestWeek;
  submitted: DigestList<DigestRole>;
  ready: DigestList<DigestRole>;
  /** Prepared rows the release check refuses right now; `reason` is the refusal (e.g. "Campaign is paused"). */
  held: DigestList<DigestRole>;
  waiting: DigestList<DigestRole>;
  referralDrafts: DigestList<DigestReferralDraft>;
  campaign: DigestCampaign;
}

export interface DigestLinks {
  activity: string;
  campaign: string;
  warmPaths: string;
  /** Only when the campaign is active. */
  pause: string | null;
  unsubscribe: string;
}

export interface DigestMessage {
  subject: string;
  text: string;
  html: string;
}

export const DIGEST_SECTION_LIMIT = 10;
