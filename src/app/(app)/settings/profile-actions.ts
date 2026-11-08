"use server";

import { revalidatePath } from "next/cache";
import type { TimeZoneFormState } from "@/components/settings/time-zone-state";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { canonicalTimeZone, timeZoneLabel, timeZoneSchemaFor } from "@/lib/profile";

// Settings → Profile → Time zone. The user comes from the session; the form only names an IANA zone.
// A change applies right away, mid-week included: it moves the ISO-week cap window and the end of campaign endsOn.

const result = (status: TimeZoneFormState["status"], message: string, selected: string | null): TimeZoneFormState => ({
  status,
  message,
  selected,
  nonce: Date.now(),
});

/** Re-reads the stored zone inside the transaction, so the no-op check and the audit "from" never use a stale session copy. */
async function saveTimeZone(userId: string, timezone: string): Promise<"saved" | "unchanged"> {
  return db.$transaction(async (tx) => {
    const { timezone: from } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    if (timezone === (canonicalTimeZone(from) ?? from)) return "unchanged";
    await tx.user.update({ where: { id: userId }, data: { timezone } });
    await writeAudit(userId, "user", "profile.updated", { fields: ["timezone"], from, to: timezone }, tx);
    return "saved";
  });
}

export async function updateTimeZoneAction(_prev: TimeZoneFormState, formData: FormData): Promise<TimeZoneFormState> {
  const user = await requireUser();
  const parsed = timeZoneSchemaFor(user.timezone).safeParse(formData.get("timezone"));
  if (!parsed.success) return result("error", "Pick a time zone from the list.", null);

  const timezone = parsed.data;
  const label = timeZoneLabel(timezone);
  const outcome = await saveTimeZone(user.id, timezone).catch((error: unknown) => {
    console.error("[settings] time zone update failed", { userId: user.id, error: error instanceof Error ? error.message : error });
    return "failed" as const;
  });
  if (outcome === "failed") return result("error", "We couldn't save your time zone. Nothing changed. Try again.", timezone);
  if (outcome === "unchanged") return result("success", `Your time zone is already ${label}. Nothing changed.`, timezone);
  revalidatePath("/settings");
  return result("success", `Saved. Your time zone is ${label}. Your weekly limit resets Monday at 00:00 there.`, timezone);
}
