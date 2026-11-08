import "server-only";
import type { AuditEvent } from "@/generated/prisma/client";
import { getCampaignState } from "@/lib/campaign";
import { db } from "@/lib/db";
import { parseApplicationPacket, type ApplicationPacket } from "@/lib/packet-types";
import { actorSchema, applicationStatusSchema, type Actor, type ApplicationStatus } from "@/lib/types";
import { getReleaseVerdicts, type ReleaseVerdict } from "./release";
import { countWeek } from "./week-count";

// Data for the Activity page: every application with its job, resume, packet and audit trail.

export interface ActivityEvent {
  id: string;
  actor: Actor;
  action: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface ActivityItem {
  id: string;
  status: ApplicationStatus;
  decidedBy: string;
  reason: string;
  companyName: string;
  title: string;
  jobUrl: string;
  resumeFilename: string | null;
  packet: ApplicationPacket | null;
  createdAt: Date;
  submittedAt: Date | null;
  /** Prepared rows only: whether the packet may be released right now (same verdict as getSubmissionPacket). */
  release: ReleaseVerdict | null;
  /** Newest first. */
  events: ActivityEvent[];
}

export interface ActivityStats {
  weekCount: number;
  weeklyCap: number | null;
  waiting: number;
  prepared: number;
  submitted: number;
  skipped: number;
}

export interface ActivityData {
  items: ActivityItem[];
  stats: ActivityStats;
  /** True when an approved campaign is active (the weekly pass can run). */
  campaignActive: boolean;
}

const STATUS_ORDER: Record<ApplicationStatus, number> = { waiting: 0, prepared: 1, submitted: 2, skipped: 3 };
const AUDIT_SCAN_LIMIT = 2000;
const APPLICATION_LIMIT = 500;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function groupEvents(events: AuditEvent[]): Map<string, ActivityEvent[]> {
  const byApplication = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const payload = asRecord(event.payload);
    const applicationId = payload.applicationId;
    const actor = actorSchema.safeParse(event.actor);
    if (typeof applicationId !== "string" || !actor.success) continue;
    const list = byApplication.get(applicationId) ?? [];
    byApplication.set(applicationId, [
      ...list,
      { id: event.id, actor: actor.data, action: event.action, payload, createdAt: event.createdAt },
    ]);
  }
  return byApplication;
}

export function sortActivity(items: readonly ActivityItem[]): ActivityItem[] {
  return [...items].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function getActivity(userId: string, timeZone: string, now: Date = new Date()): Promise<ActivityData> {
  const [applications, events, count, state, verdicts] = await Promise.all([
    db.application.findMany({
      where: { userId },
      include: { job: { include: { company: true } }, resume: { select: { filename: true } } },
      orderBy: { createdAt: "desc" },
      take: APPLICATION_LIMIT,
    }),
    db.auditEvent.findMany({
      where: { userId, action: { startsWith: "application." } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: AUDIT_SCAN_LIMIT,
    }),
    countWeek(db, userId, now, timeZone),
    getCampaignState(userId),
    getReleaseVerdicts(userId, now),
  ]);
  const eventsById = groupEvents(events);
  const items = applications.map((app): ActivityItem => ({
    id: app.id,
    status: applicationStatusSchema.catch("waiting").parse(app.status),
    decidedBy: app.decidedBy,
    reason: app.reason,
    companyName: app.job.company.name,
    title: app.job.title,
    jobUrl: app.job.url,
    resumeFilename: app.resume?.filename ?? null,
    packet: parseApplicationPacket(app.packet),
    createdAt: app.createdAt,
    submittedAt: app.submittedAt,
    release: verdicts.get(app.id) ?? null,
    events: eventsById.get(app.id) ?? [],
  }));
  const countOf = (status: ApplicationStatus) => items.filter((item) => item.status === status).length;
  return {
    items: sortActivity(items),
    stats: {
      weekCount: count,
      weeklyCap: state.rulesInForce?.weeklyCap ?? null,
      waiting: countOf("waiting"),
      prepared: countOf("prepared"),
      submitted: countOf("submitted"),
      skipped: countOf("skipped"),
    },
    campaignActive: state.campaign?.status === "active" && state.rulesInForce !== null,
  };
}
