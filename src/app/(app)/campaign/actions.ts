"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  approveVersion,
  findOwnVersion,
  getCampaignState,
  isCampaignError,
  proposeRules,
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

type ProposedRules = Parameters<typeof proposeRules>[1];

const NOTHING_CHANGED: CampaignActionResult = { ok: true, message: "Nothing changed. These rules are already in force." };
const PENDING_WITHDRAWN: CampaignActionResult = {
  ok: true,
  message: "Pending changes dropped. Your approved rules stay in force.",
};

/** Save the form as a new pending version without approving it. */
export async function saveRulesAction(input: unknown): Promise<CampaignActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return SIGNED_OUT;
  try {
    // proposeRules validates the rules with the zod schema.
    const { outcome } = await proposeRules(userId, input as ProposedRules, "web");
    if (outcome === "unchanged_in_force") return NOTHING_CHANGED;
    refresh();
    if (outcome === "withdrawn_pending") return PENDING_WITHDRAWN;
    return { ok: true, message: "Saved. These rules aren't in force until you approve them." };
  } catch (error) {
    return failure("save", userId, error);
  }
}

/** The approve form: the versionId whose summary was on screen (hidden input, "" when none) and its rules. */
const approveFormSchema = z.object({
  versionId: z.string().trim().max(200),
  rules: z.string().min(2).max(20_000),
});

function readApproveForm(formData: FormData): { versionId: string; rules: unknown } | null {
  const parsed = approveFormSchema.safeParse({ versionId: formData.get("versionId") ?? "", rules: formData.get("rules") });
  if (!parsed.success) return null;
  try {
    return { versionId: parsed.data.versionId, rules: JSON.parse(parsed.data.rules) as unknown };
  } catch {
    return null;
  }
}

/**
 * Which version to approve so that what the user saw is exactly what goes into force: the displayed
 * version when the submitted rules are its stored rules (approveVersion refuses it as stale if a newer
 * proposal replaced it meanwhile), else the form's unsaved edits, saved as a new version first.
 * Returns the result to report instead when the rules are already in force (a pending version, if any,
 * is withdrawn).
 */
async function approvalTarget(userId: string, versionId: string, rules: unknown): Promise<string | CampaignActionResult> {
  const shown = versionId ? await findOwnVersion(userId, versionId) : null;
  const submitted = parseCampaignRules(rules);
  if (shown && submitted && !shown.approvedAt && rulesEqual(submitted, parseCampaignRules(shown.rules))) return shown.id;
  const proposal = await proposeRules(userId, rules as ProposedRules, "web");
  if (proposal.outcome === "unchanged_in_force") return NOTHING_CHANGED;
  if (proposal.outcome === "withdrawn_pending") {
    refresh();
    return PENDING_WITHDRAWN;
  }
  return proposal.version.id;
}

/** Approve exactly the rules whose summary the form displayed. */
export async function approveRulesAction(formData: FormData): Promise<CampaignActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return SIGNED_OUT;
  const form = formData instanceof FormData ? readApproveForm(formData) : null;
  if (!form) return { ok: false, message: "We couldn't read those rules. Reload the page and try again." };
  try {
    const hadRulesInForce = Boolean((await getCampaignState(userId)).inForce);
    const target = await approvalTarget(userId, form.versionId, form.rules);
    if (typeof target !== "string") return target;
    await approveVersion(userId, target, "web");
    refresh();
    return { ok: true, message: hadRulesInForce ? "New rules approved" : "Campaign approved" };
  } catch (error) {
    // A stale version means the page is out of date: refresh it so the latest summary shows.
    if (isCampaignError(error) && error.code === "stale_version") refresh();
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
