import "server-only";
import type { Campaign } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { campaignStatusSchema } from "@/lib/types";
import { CampaignError } from "./errors";
import { findLiveCampaign, listVersions, splitVersions } from "./state";
import { checkStatusTransition, type SettableCampaignStatus } from "./transitions";

const SETTABLE = ["active", "paused", "revoked"] as const;

const AUDIT_ACTION: Record<SettableCampaignStatus, string> = {
  active: "campaign.resumed",
  paused: "campaign.paused",
  revoked: "campaign.revoked",
};

interface StatusOutcome {
  campaign: Campaign;
  from: string;
}

/** Pause, resume or revoke the user's live campaign. Revoke is terminal. */
export async function setCampaignStatus(userId: string, status: SettableCampaignStatus): Promise<Campaign> {
  if (!(SETTABLE as readonly string[]).includes(status)) {
    throw new CampaignError("invalid_transition", "Unknown campaign status.");
  }
  const outcome = await db.$transaction(async (tx): Promise<StatusOutcome> => {
    const campaign = await findLiveCampaign(tx, userId);
    if (!campaign) throw new CampaignError("not_found", "You don't have a campaign yet.");
    const current = campaignStatusSchema.catch("paused").parse(campaign.status);
    const { inForce } = splitVersions(await listVersions(tx, campaign.id));
    const check = checkStatusTransition(current, status, Boolean(inForce));
    if (!check.ok) throw new CampaignError("invalid_transition", check.reason);
    const updated = await tx.campaign.update({ where: { id: campaign.id }, data: { status } });
    return { campaign: updated, from: campaign.status };
  });
  await writeAudit(userId, "user", AUDIT_ACTION[status], {
    campaignId: outcome.campaign.id,
    from: outcome.from,
    to: status,
  });
  return outcome.campaign;
}
