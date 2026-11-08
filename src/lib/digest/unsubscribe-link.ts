import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { checkLink, failure, type LinkOutcome } from "./link-outcome";

// The digest's "Stop these emails" link: sets User.digestOptOut. Same rules as the pause link: the token
// authorises only this, GET never changes anything, the POSTed server action does.

export const UNSUBSCRIBED_VIA_EMAIL_ACTION = "digest.unsubscribed_via_email";

const MESSAGES = {
  ready: "You'll stop getting the weekly Inroad digest. Your campaign and applications don't change.",
  done: "Done. You won't get the weekly digest any more. Your campaign and applications didn't change.",
  already: "You've already stopped the weekly digest. Nothing changed.",
  noUser: "This link is for an account that no longer exists.",
} as const;

async function inspect(userId: string): Promise<LinkOutcome> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { digestOptOut: true } });
  if (!user) return { status: "not_applicable", message: MESSAGES.noUser };
  if (user.digestOptOut) return { status: "already", message: MESSAGES.already };
  return { status: "ready", message: MESSAGES.ready };
}

/** Read-only: what the unsubscribe page should show for this token. */
export async function inspectUnsubscribeLink(token: unknown, now: Date = new Date()): Promise<LinkOutcome> {
  const checked = checkLink(token, "unsubscribe", now);
  if (!checked.ok) return checked.outcome;
  try {
    return await inspect(checked.claims.userId);
  } catch (error) {
    return failure("unsubscribe link inspect", checked.claims.userId, error);
  }
}

/** Set digestOptOut for the user in the token. Audits `digest.unsubscribed_via_email` (actor 'user'). */
export async function unsubscribeFromLink(token: unknown, now: Date = new Date()): Promise<LinkOutcome> {
  const checked = checkLink(token, "unsubscribe", now);
  if (!checked.ok) return checked.outcome;
  const { userId } = checked.claims;
  try {
    // The opt-out and its audit commit together: a failed audit leaves the digest on, matching the error copy.
    const changed = await db.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({ where: { id: userId, digestOptOut: false }, data: { digestOptOut: true } });
      if (count > 0) await writeAudit(userId, "user", UNSUBSCRIBED_VIA_EMAIL_ACTION, { via: "digest_email" }, tx);
      return count > 0;
    });
    if (!changed) return inspect(userId);
    return { status: "done", message: MESSAGES.done };
  } catch (error) {
    return failure("unsubscribe via email", userId, error);
  }
}
