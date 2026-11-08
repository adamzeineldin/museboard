import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { buildDigest, type BuiltDigest } from "./build";
import { digestLinkConfig, type DigestLinkConfig } from "./config";
import { createDigestMailer, type DigestMailer } from "./mailer";
import { claimDigestWeek, DIGEST_SENT_ACTION, releaseDigestWeek } from "./send-claim";

// Weekly run: one digest per user, each user isolated (a failure is logged and counted, never fatal).
// Each (user, week) is claimed before sending (send-claim.ts), so a re-run, a manual run, or one that
// overlaps the cron never sends the same week twice.

export { DIGEST_SENT_ACTION };
const PAGE_SIZE = 100;

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

/** Send, giving the claim back when the mailer fails so the next run retries this user. */
async function sendClaimed(userId: string, weekStart: string, built: Extract<BuiltDigest, { status: "ready" }>, deps: Required<SendDigestDeps>): Promise<void> {
  try {
    await deps.mailer.send({ userId, to: built.to, message: built.message, unsubscribeUrl: built.links.unsubscribe });
  } catch (error) {
    try {
      await releaseDigestWeek(userId, weekStart, errorMessage(error));
    } catch (releaseError) {
      deps.logError(`[digest] could not release the claim for user ${userId}, it won't be retried this week: ${errorMessage(releaseError)}`);
    }
    throw error;
  }
}

type Outcome = "sent" | "skipped";

async function sendOne(userId: string, now: Date, deps: Required<SendDigestDeps>): Promise<Outcome> {
  const built = await deps.build(userId, now, deps.links);
  if (built.status === "skipped") return "skipped";
  const weekStart = built.data.week.start.toISOString();
  if (!(await claimDigestWeek(userId, weekStart))) return "skipped";

  await sendClaimed(userId, weekStart, built, deps);
  try {
    await writeAudit(userId, "inroad", DIGEST_SENT_ACTION, {
      weekStart,
      weekEnd: built.data.week.end.toISOString(),
      submitted: built.data.submitted.total,
      ready: built.data.ready.total,
      held: built.data.held.total,
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
