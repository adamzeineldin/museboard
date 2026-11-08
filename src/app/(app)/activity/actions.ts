"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { passToastMessage } from "@/components/activity/view-model";
import {
  approveWaiting,
  checkRelease,
  CONFIRMATION_MAX,
  isApplicationError,
  recordSubmission,
  runWeeklyPass,
  skipWaiting,
} from "@/lib/applications";
import { getSessionUserId } from "@/lib/current-user";

// Activity page server actions. The user always comes from the session; every call checks ownership
// inside the applications service (rows are looked up by id AND userId).

export interface ActivityActionResult {
  ok: boolean;
  message: string;
}

const SIGNED_OUT: ActivityActionResult = { ok: false, message: "Your session ended. Sign in again." };
const idSchema = z.string().trim().min(1).max(200);
const confirmationSchema = z.string().max(CONFIRMATION_MAX * 2).optional();

function refresh(): void {
  revalidatePath("/activity");
  revalidatePath("/", "layout");
}

/** The release check refused: a user-safe reason, not an internal error. */
class HeldError extends Error {}

function failure(scope: string, userId: string, error: unknown): ActivityActionResult {
  if (isApplicationError(error)) return { ok: false, message: error.message };
  if (error instanceof HeldError) {
    const reason = error.message.endsWith(".") ? error.message : `${error.message}.`;
    return { ok: false, message: `Not released: ${reason} Nothing was changed.` };
  }
  console.error(`[activity] ${scope} failed`, { userId, error: error instanceof Error ? error.message : error });
  return { ok: false, message: "Something went wrong. Nothing was changed. Try again." };
}

async function withApplication(
  scope: string,
  applicationId: unknown,
  run: (userId: string, id: string) => Promise<string>,
): Promise<ActivityActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return SIGNED_OUT;
  const id = idSchema.safeParse(applicationId);
  if (!id.success) return { ok: false, message: "We couldn't find that application." };
  try {
    const message = await run(userId, id.data);
    refresh();
    return { ok: true, message };
  } catch (error) {
    return failure(scope, userId, error);
  }
}

export async function approveApplicationAction(applicationId: unknown): Promise<ActivityActionResult> {
  return withApplication("approve", applicationId, async (userId, id) => {
    await approveWaiting(userId, id);
    return "Approved. It's ready to submit.";
  });
}

export async function skipApplicationAction(applicationId: unknown): Promise<ActivityActionResult> {
  return withApplication("skip", applicationId, async (userId, id) => {
    await skipWaiting(userId, id);
    return "Skipped";
  });
}

export async function markSubmittedAction(applicationId: unknown, confirmationText?: unknown): Promise<ActivityActionResult> {
  const confirmation = confirmationSchema.safeParse(confirmationText ?? undefined);
  if (!confirmation.success) return { ok: false, message: "That confirmation is too long." };
  return withApplication("record submission", applicationId, async (userId, id) => {
    // Same release check getSubmissionPacket gives Muse: a held packet can't be marked submitted.
    const release = await checkRelease(userId, id);
    if (!release.allowed) throw new HeldError(release.reason);
    await recordSubmission(userId, id, "user", confirmation.data);
    return "Marked as submitted";
  });
}

export async function runWeeklyPassAction(): Promise<ActivityActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return SIGNED_OUT;
  try {
    const summary = await runWeeklyPass(userId, "user");
    refresh();
    return { ok: !summary.reason, message: passToastMessage(summary) };
  } catch (error) {
    return failure("weekly pass", userId, error);
  }
}
