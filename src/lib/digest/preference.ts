import "server-only";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

// Settings → Weekly digest: the signed-in user turns the digest on or off (User.digestOptOut).
// The email's unsubscribe link (unsubscribe-link.ts) is the other way to turn it off.

export const DIGEST_PREFERENCE_ACTION = "digest.preference_changed";

export class DigestPreferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DigestPreferenceError";
  }
}

export interface DigestPreferenceResult {
  enabled: boolean;
  changed: boolean;
}

/** Set whether the user gets the weekly digest. Audits `digest.preference_changed` (actor 'user') on a change. */
export async function setDigestEnabled(userId: string, enabled: boolean): Promise<DigestPreferenceResult> {
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) throw new DigestPreferenceError("Choose on or off.");
  const optOut = !parsed.data;
  // The change and its audit commit together, so a failed audit leaves the setting as it was.
  const changed = await db.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId, digestOptOut: !optOut }, data: { digestOptOut: optOut } });
    if (count > 0) await writeAudit(userId, "user", DIGEST_PREFERENCE_ACTION, { enabled: parsed.data, via: "settings" }, tx);
    return count > 0;
  });
  if (!changed) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { digestOptOut: true } });
    if (!user) throw new DigestPreferenceError("We couldn't find your account.");
    return { enabled: !user.digestOptOut, changed: false };
  }
  return { enabled: parsed.data, changed: true };
}
