import "server-only";
import { writeAudit } from "@/lib/audit";
import { getCampaignState, isCampaignError, setCampaignStatus } from "@/lib/campaign";
import { checkLink, failure, type LinkOutcome } from "./link-outcome";
import type { LinkClaims } from "./tokens";

// The digest's "Pause campaign" link. The signed token authorises exactly one thing: pausing the campaign
// it names, for the user it names. No sign-in needed. Inspecting (GET) never changes anything; only
// pauseCampaignFromLink (the POSTed server action) does.

export const PAUSED_VIA_EMAIL_ACTION = "campaign.paused_via_email";

const MESSAGES = {
  ready: "Pausing stops Inroad from preparing new applications until you resume. Nothing already submitted changes, and your rules stay as they are.",
  done: "Your campaign is paused. Inroad won't prepare applications until you resume it from the Campaign page.",
  already: "Your campaign is already paused. Nothing changed.",
  notRunning: "This link is for a campaign that isn't running any more, so there's nothing to pause.",
} as const;

async function inspect(claims: LinkClaims): Promise<LinkOutcome> {
  const { campaign, inForce } = await getCampaignState(claims.userId);
  if (!campaign || campaign.id !== claims.campaignId) return { status: "not_applicable", message: MESSAGES.notRunning };
  if (campaign.status === "paused") return { status: "already", message: MESSAGES.already };
  if (campaign.status !== "active" || !inForce) return { status: "not_applicable", message: MESSAGES.notRunning };
  return { status: "ready", message: MESSAGES.ready };
}

/** Read-only: what the pause page should show for this token. */
export async function inspectPauseLink(token: unknown, now: Date = new Date()): Promise<LinkOutcome> {
  const checked = checkLink(token, "pause", now);
  if (!checked.ok) return checked.outcome;
  try {
    return await inspect(checked.claims);
  } catch (error) {
    return failure("pause link inspect", checked.claims.userId, error);
  }
}

/**
 * The pause is already committed (and audited as `campaign.paused` by the campaign service), so a failure
 * here is logged, never reported to the user as "Nothing was changed".
 */
async function auditPausedViaEmail(userId: string, campaignId: string | undefined): Promise<void> {
  try {
    await writeAudit(userId, "user", PAUSED_VIA_EMAIL_ACTION, { campaignId, via: "digest_email" });
  } catch (error) {
    console.error("[digest] campaign paused via email but the extra audit entry failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Pause the campaign named in the token. Audits `campaign.paused_via_email` (actor 'user'). */
export async function pauseCampaignFromLink(token: unknown, now: Date = new Date()): Promise<LinkOutcome> {
  const checked = checkLink(token, "pause", now);
  if (!checked.ok) return checked.outcome;
  const { userId, campaignId } = checked.claims;
  try {
    const before = await inspect(checked.claims);
    if (before.status !== "ready") return before;
    try {
      await setCampaignStatus(userId, "paused");
    } catch (error) {
      // Lost a race (paused or revoked meanwhile): describe the state now.
      if (isCampaignError(error)) return inspect(checked.claims);
      throw error;
    }
    await auditPausedViaEmail(userId, campaignId);
    return { status: "done", message: MESSAGES.done };
  } catch (error) {
    return failure("pause via email", userId, error);
  }
}
