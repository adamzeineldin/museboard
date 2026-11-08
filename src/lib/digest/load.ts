import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getReleaseVerdicts } from "@/lib/applications";
import { db } from "@/lib/db";
import { loadDigestCampaign } from "./campaign-status";
import { DIGEST_SECTION_LIMIT, type DigestData, type DigestList, type DigestReferralDraft, type DigestRole } from "./types";
import { digestWeek } from "./week";

// Read-only loader for one user's digest. Changes nothing.

export interface DigestRecipient {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  digestOptOut: boolean;
}

const withJob = { job: { select: { title: true, company: { select: { name: true } } } } } as const;
type ApplicationWithJob = Prisma.ApplicationGetPayload<{ include: typeof withJob }>;

const toRole = (app: ApplicationWithJob, at: Date | null): DigestRole => ({
  company: app.job.company.name,
  title: app.job.title,
  at,
  reason: app.reason,
});

async function listApplications(where: Prisma.ApplicationWhereInput, orderBy: Prisma.ApplicationOrderByWithRelationInput[]): Promise<{
  rows: ApplicationWithJob[];
  total: number;
}> {
  const [rows, total] = await Promise.all([
    db.application.findMany({ where, include: withJob, orderBy, take: DIGEST_SECTION_LIMIT }),
    db.application.count({ where }),
  ]);
  return { rows, total };
}

async function loadReferralDrafts(userId: string, range: { gte: Date; lt: Date }): Promise<DigestList<DigestReferralDraft>> {
  const where = { userId, kind: "referral_ask", createdAt: range } satisfies Prisma.OutreachWhereInput;
  const [rows, total] = await Promise.all([
    db.outreach.findMany({
      where,
      include: { contact: { select: { name: true } }, company: { select: { name: true } }, job: { select: { title: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: DIGEST_SECTION_LIMIT,
    }),
    db.outreach.count({ where }),
  ]);
  return {
    items: rows.map((row) => ({
      contactName: row.contact.name,
      company: row.company.name,
      title: row.job?.title ?? null,
      createdAt: row.createdAt,
      markedSent: row.status === "sent_by_user",
    })),
    total,
  };
}

const EMPTY_LIST: DigestList<DigestRole> = { items: [], total: 0 };

async function listPrepared(userId: string, ids: readonly string[], reasonFor: (app: ApplicationWithJob) => string): Promise<DigestList<DigestRole>> {
  if (ids.length === 0) return EMPTY_LIST;
  const { rows, total } = await listApplications({ userId, status: "prepared", id: { in: [...ids] } }, [{ decidedAt: "desc" }, { id: "desc" }]);
  return { items: rows.map((app) => ({ ...toRole(app, app.decidedAt), reason: reasonFor(app) })), total };
}

/**
 * Prepared rows split by the release check right now. A held one (paused campaign, closed posting, over the
 * cap) is not "ready": Activity, Jobs and Muse all show it as "Held: <reason>", so the digest does too.
 */
async function loadPrepared(userId: string, now: Date): Promise<{ ready: DigestList<DigestRole>; held: DigestList<DigestRole> }> {
  const verdicts = await getReleaseVerdicts(userId, now);
  const idsWhere = (allowed: boolean): string[] => [...verdicts].filter(([, verdict]) => verdict.allowed === allowed).map(([id]) => id);
  const [ready, held] = await Promise.all([
    listPrepared(userId, idsWhere(true), (app) => app.reason),
    listPrepared(userId, idsWhere(false), (app) => verdicts.get(app.id)?.reason ?? app.reason),
  ]);
  return { ready, held };
}

const firstName = (name: string | null): string | null => name?.trim().split(/\s+/)[0] || null;

export async function loadDigestData(user: DigestRecipient, now: Date): Promise<DigestData> {
  const week = digestWeek(now, user.timezone);
  const range = { gte: week.start, lt: week.end };
  const userId = user.id;
  const [submitted, prepared, waiting, referralDrafts, campaign] = await Promise.all([
    listApplications({ userId, status: "submitted", submittedAt: range }, [{ submittedAt: "desc" }, { id: "desc" }]),
    loadPrepared(userId, now),
    listApplications({ userId, status: "waiting" }, [{ createdAt: "desc" }, { id: "desc" }]),
    loadReferralDrafts(userId, range),
    loadDigestCampaign(userId, week, now),
  ]);
  return {
    userId,
    firstName: firstName(user.name),
    week,
    submitted: { items: submitted.rows.map((app) => toRole(app, app.submittedAt)), total: submitted.total },
    ready: prepared.ready,
    held: prepared.held,
    waiting: { items: waiting.rows.map((app) => toRole(app, null)), total: waiting.total },
    referralDrafts,
    campaign,
  };
}

/** Anything worth an email even without an active campaign. */
export function hasSomethingToReport(data: DigestData): boolean {
  return data.submitted.total + data.ready.total + data.held.total + data.waiting.total + data.referralDrafts.total > 0;
}
