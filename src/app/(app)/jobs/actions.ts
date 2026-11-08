"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isApplicationError, prepareApplication } from "@/lib/applications";
import { getSessionUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { prepareMessage, type PrepareActionResult } from "./prepare-message";

const jobIdSchema = z.string().trim().min(1).max(300);

/**
 * "Prepare" on a job card: always creates (or re-checks) an Application, prepared or waiting
 * (ARCHITECTURE "Weekly pass candidates"). prepareApplication writes the audit entry with the
 * rule-check result. The user comes from the session, never from the form.
 */
export async function prepareJobAction(jobId: unknown): Promise<PrepareActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, message: "Your session ended. Sign in again to prepare applications." };

  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) return { ok: false, message: "We couldn't tell which job you meant. Reload the page and try again." };

  try {
    const job = await db.job.findUnique({ where: { id: parsed.data }, include: { company: { select: { name: true } } } });
    if (!job) return { ok: false, message: "That job is no longer listed." };
    if (job.closedAt) return { ok: false, message: "That posting has closed, so there's nothing to prepare." };

    const application = await prepareApplication(userId, job.id, "user");
    revalidatePath("/jobs");
    revalidatePath("/activity");
    return {
      ok: true,
      status: application.status,
      message: prepareMessage({ status: application.status, reason: application.reason, title: job.title, companyName: job.company.name }),
    };
  } catch (error) {
    if (isApplicationError(error)) return { ok: false, message: error.message };
    console.error("[jobs] prepare failed", { userId, jobId: parsed.data, error: error instanceof Error ? error.message : error });
    return { ok: false, message: "We couldn't prepare that application. Try again in a moment." };
  }
}
