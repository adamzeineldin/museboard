"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  approveVersion,
  getCampaignState,
  isCampaignError,
  proposeVersion,
  rulesEqual,
  setCampaignStatus,
} from "@/lib/campaign";
import { getSessionUserId } from "@/lib/current-user";
import { parseCampaignRules } from "@/lib/types";

// Campaign page server actions. The user always comes from the session, never from the form.

export interface CampaignActionResult {
  ok: boolean;
  message: string;
}

const SIGNED_OUT: CampaignActionResult = { ok: false, message: "Your session ended. Sign in again." };
const statusSchema = z.enum(["active", "paused", "revoked"]);

const STATUS_MESSAGE: Record<z.infer<typeof statusSchema>, string> = {
  active: "Campaign resumed",
  paused: "Campaign paused. Nothing goes out until you resume.",
  revoked: "Campaign revoked. Inroad will ask before every application.",
};

function refresh(): void {
  revalidatePath("/campaign");
  revalidatePath("/", "layout");
}

function failure(scope: string, userId: string, error: unknown): CampaignActionResult {
  if (isCampaignError(error)) return { ok: false, message: error.message };
  console.error(`[campaign] ${scope} failed`, { userId, error: error instanceof Error ? error.message : error });
  return { ok: false, message: "We couldn't save that. Your approved rules are unchanged. Try again." };
}

/** Save the form as the pending version without approving it. */
export async function saveRulesAction(input: unknown): Promise<CampaignActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return SIGNED_OUT;
  try {
    // proposeVersion validates the rules with the zod schema.
    await proposeVersion(userId, input as Parameters<typeof proposeVersion>[1], "web");
    refresh();
    return { ok: true, message: "Saved. These rules aren't in force until you approve them." };
  } catch (error) {
    return failure("save", userId, error);
  }
}

/** Approve the form's rules: reuse the pending version when it already holds them, else propose then approve. */
export async function approveRulesAction(input: unknown): Promise<CampaignActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return SIGNED_OUT;
  try {
    const state = await getCampaignState(userId);
    const rules = parseCampaignRules(input);
    const pendingRules = state.pending ? parseCampaignRules(state.pending.rules) : null;
    const reusePending = state.pending && rules && rulesEqual(rules, pendingRules);
    const versionId = reusePending && state.pending
      ? state.pending.id
      : (await proposeVersion(userId, input as Parameters<typeof proposeVersion>[1], "web")).id;
    await approveVersion(userId, versionId, "web");
    refresh();
    return { ok: true, message: state.inForce ? "New rules approved" : "Campaign approved" };
  } catch (error) {
    return failure("approve", userId, error);
  }
}

export async function setCampaignStatusAction(status: unknown): Promise<CampaignActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return SIGNED_OUT;
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, message: "Unknown campaign action." };
  try {
    await setCampaignStatus(userId, parsed.data);
    refresh();
    return { ok: true, message: STATUS_MESSAGE[parsed.data] };
  } catch (error) {
    return failure(`status ${parsed.data}`, userId, error);
  }
}
