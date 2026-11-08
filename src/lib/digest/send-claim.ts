import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

// Claims a (user, week) digest slot before the email goes out, so two overlapping runs (the Monday cron and
// a manual `digest:once`) can't both send it. The claim is a `digest.sending` audit row written in the same
// transaction that checks for earlier ones. Transactions start with BEGIN IMMEDIATE, so an overlapping run
// waits for the write lock, then sees the claim and skips. Only if it gives up at the busy timeout does it
// fail, with no claim written, and it is counted as failed, never as a second send. No schema change needed.
//
// For one week a slot is taken when a `digest.sent` row exists, or when there are more `digest.sending`
// rows than `digest.send_failed` rows (a send in progress, or one that crashed mid-send, which is never
// retried automatically: a missed digest is better than a duplicate).

export const DIGEST_SENT_ACTION = "digest.sent";
export const DIGEST_SENDING_ACTION = "digest.sending";
export const DIGEST_SEND_FAILED_ACTION = "digest.send_failed";

const CLAIM_ACTIONS = [DIGEST_SENT_ACTION, DIGEST_SENDING_ACTION, DIGEST_SEND_FAILED_ACTION];
/** Recent digest rows to scan per user; a few per week is normal. */
const CLAIM_SCAN = 50;

interface ClaimEvent {
  action: string;
  payload: unknown;
}

const weekOf = (event: ClaimEvent): unknown => (event.payload as { weekStart?: unknown } | null)?.weekStart;

/** Pure: whether these audit rows already hold the slot for `weekStart`. */
export function isWeekTaken(events: readonly ClaimEvent[], weekStart: string): boolean {
  const forWeek = events.filter((event) => weekOf(event) === weekStart);
  const count = (action: string): number => forWeek.filter((event) => event.action === action).length;
  if (count(DIGEST_SENT_ACTION) > 0) return true;
  return count(DIGEST_SENDING_ACTION) > count(DIGEST_SEND_FAILED_ACTION);
}

/** Atomically claim the week's digest for this user. False when it was sent, or another run holds it. */
export async function claimDigestWeek(userId: string, weekStart: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const events = await tx.auditEvent.findMany({
      where: { userId, action: { in: CLAIM_ACTIONS } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CLAIM_SCAN,
      select: { action: true, payload: true },
    });
    if (isWeekTaken(events, weekStart)) return false;
    await writeAudit(userId, "inroad", DIGEST_SENDING_ACTION, { weekStart }, tx);
    return true;
  });
}

/** Give the slot back after a failed send, so the next run retries this user. */
export async function releaseDigestWeek(userId: string, weekStart: string, error: string): Promise<void> {
  await writeAudit(userId, "inroad", DIGEST_SEND_FAILED_ACTION, { weekStart, error });
}
