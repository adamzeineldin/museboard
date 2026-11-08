import "server-only";
import type { CampaignVersion } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { RuleCampaign } from "@/lib/rules";
import { campaignStatusSchema, type CampaignRules } from "@/lib/types";
import type { DbClient } from "./client";
import { listVersions, splitVersions } from "./state";

export interface RuleContext {
  /** null when the user never had a campaign. */
  ruleCampaign: RuleCampaign | null;
  versionInForce: CampaignVersion | null;
  rules: CampaignRules | null;
}

/**
 * The rule-engine view of the user's newest campaign, whatever its status, so a revoked campaign
 * still reads "Campaign is paused" (brief sec. 4, check 2). Unknown statuses fail closed as paused.
 */
export async function loadRuleCampaign(userId: string, timeZone: string, client: DbClient = db): Promise<RuleContext> {
  const campaign = await client.campaign.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!campaign) return { ruleCampaign: null, versionInForce: null, rules: null };
  const { inForce, rulesInForce } = splitVersions(await listVersions(client, campaign.id));
  const status = campaignStatusSchema.catch("paused").parse(campaign.status);
  const usable = inForce && rulesInForce ? inForce : null;
  return {
    ruleCampaign: { status, inForce: usable && rulesInForce ? { rules: rulesInForce } : null, timeZone },
    versionInForce: usable,
    rules: usable ? rulesInForce : null,
  };
}
