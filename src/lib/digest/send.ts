import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { buildDigest, type BuiltDigest } from "./build";
import { digestLinkConfig, type DigestLinkConfig } from "./config";
import { createDigestMailer, type DigestMailer } from "./mailer";

// Weekly run: one digest per user, each user isolated (a failure is logged and counted, never fatal).
// A digest already sent for a week is not sent again, so a re-run or a manual run is safe.

export const DIGEST_SENT_ACTION = "digest.sent";
const PAGE_SIZE = 100;
const SENT_SCAN = 10;

export interface DigestRunSummary {
  users: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface SendDigestDeps {
  mailer?: DigestMailer;
  links?: DigestLinkConfig;
  build?: (userId: string, now: Date, links: DigestLinkConfig) => Promise<BuiltDigest>;
  logError?: (line: string) => void;
}

/** Strip credentials from anything that looks like a URL before it reaches a log line. */
export function redactSecrets(message: string): string {
  return message.replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi, "$1[redacted]@").replace(/token=[^\s&"']+/gi, "token=[redacted]");
}

const errorMessage = (error: unknown): string => redactSecrets(error instanceof Error ? error.message : String(error));

async function alreadySent(userId: string, weekStart: string): Promise<boolean> {
  const events = await db.auditEvent.findMany({
    where: { userId, action: DIGEST_SENT_ACTION },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: SENT_SCAN,
    select: { payload: true },
  });
  return events.some((event) => (event.payload as { weekStart?: unknown } | null)?.weekStart === weekStart);
}

type Outcome = "sent" | "skipped";

async function sendOne(userId: string, now: Date, deps: Required<SendDigestDeps>): Promise<Outcome> {
  const built = await deps.build(userId, now, deps.links);
  if (built.status === "skipped") return "skipped";
  const weekStart = built.data.week.start.toISOString();
  if (await alreadySent(userId, weekStart)) return "skipped";

  await deps.mailer.send({ userId, to: built.to, message: built.message, unsubscribeUrl: built.links.unsubscribe });
  try {
    await writeAudit(userId, "inroad", DIGEST_SENT_ACTION, {
      weekStart,
      weekEnd: built.data.week.end.toISOString(),
      submitted: built.data.submitted.total,
      ready: built.data.ready.total,
      waiting: built.data.waiting.total,
      referralDrafts: built.data.referralDrafts.total,
      campaign: built.data.campaign.kind,
    });
  } catch (error) {
    // The email is out; a missing audit row must not turn it into a failure (and a retry would double-send).
    deps.logError(`[digest] sent to user ${userId} but the audit entry failed: ${errorMessage(error)}`);
  }
  return "sent";
}

export async function sendWeeklyDigests(now: Date = new Date(), deps: SendDigestDeps = {}): Promise<DigestRunSummary> {
  const resolved: Required<SendDigestDeps> = {
    links: deps.links ?? digestLinkConfig(),
    mailer: deps.mailer ?? createDigestMailer(),
    build: deps.build ?? buildDigest,
    logError: deps.logError ?? ((line) => console.error(line)),
  };
  const summary = { users: 0, sent: 0, skipped: 0, failed: 0 };
  let cursor: string | undefined;
  for (;;) {
    const page = await db.user.findMany({
      where: { digestOptOut: false },
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const { id } of page) {
      summary.users += 1;
      try {
        const outcome = await sendOne(id, now, resolved);
        summary[outcome] += 1;
      } catch (error) {
        summary.failed += 1;
        resolved.logError(`[digest] failed for user ${id}: ${errorMessage(error)}`);
      }
    }
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1]?.id;
  }
  return summary;
}
