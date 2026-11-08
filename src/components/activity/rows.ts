import type { ApplicationPacket } from "@/lib/packet-types";
import type { Actor, ApplicationStatus } from "@/lib/types";
import { formatDateTime } from "../campaign/format";
import { describeAuditEvent } from "./view-model";

// Pure: turn activity items into serializable row models with times already formatted in the user's zone.

export interface ActivityItemLike {
  id: string;
  status: ApplicationStatus;
  decidedBy: string;
  reason: string;
  companyName: string;
  title: string;
  jobUrl: string;
  resumeFilename: string | null;
  packet: ApplicationPacket | null;
  events: Array<{ id: string; actor: Actor; action: string; payload: Record<string, unknown>; createdAt: Date }>;
}

export interface ActivityRowModel {
  id: string;
  status: ApplicationStatus;
  approvedByYou: boolean;
  companyName: string;
  title: string;
  reason: string;
  jobUrl: string;
  resumeFilename: string | null;
  packet: ApplicationPacket | null;
  history: Array<{ id: string; text: string; when: string; iso: string }>;
}

/** Only http(s) links are rendered as "Open application" links. */
export function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function toRowModels(items: readonly ActivityItemLike[], timeZone: string): ActivityRowModel[] {
  return items.map((item) => ({
    id: item.id,
    status: item.status,
    approvedByYou: item.decidedBy === "user" && item.status !== "skipped",
    companyName: item.companyName,
    title: item.title,
    reason: item.reason,
    jobUrl: safeHttpUrl(item.jobUrl) ?? "",
    resumeFilename: item.resumeFilename,
    packet: item.packet,
    history: item.events.map((event) => ({
      id: event.id,
      text: describeAuditEvent(event),
      when: formatDateTime(event.createdAt, timeZone),
      iso: event.createdAt.toISOString(),
    })),
  }));
}
