import "server-only";
import type { Campaign, CampaignVersion } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { pendingVersion, pickVersionInForce } from "@/lib/rules";
import { parseCampaignRules, type CampaignRules } from "@/lib/types";
import { LIVE_STATUSES, type DbClient } from "./client";

export interface CampaignState {
  campaign: Campaign | null;
  inForce: CampaignVersion | null;
  pending: CampaignVersion | null;
  rulesInForce: CampaignRules | null;
}

/** The user's live (active or paused) campaign. The service keeps at most one per user. */
export async function findLiveCampaign(client: DbClient, userId: string): Promise<Campaign | null> {
  return client.campaign.findFirst({
    where: { userId, status: { in: [...LIVE_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listVersions(client: DbClient, campaignId: string): Promise<CampaignVersion[]> {
  return client.campaignVersion.findMany({ where: { campaignId }, orderBy: { createdAt: "asc" } });
}

/** Which version governs (newest approved) and which is pending (newer, unapproved). */
export function splitVersions(versions: readonly CampaignVersion[]): Omit<CampaignState, "campaign"> {
  const inForce = pickVersionInForce(versions);
  return {
    inForce,
    pending: pendingVersion(versions),
    rulesInForce: inForce ? parseCampaignRules(inForce.rules) : null,
  };
}

/** One of the user's own campaign versions by id (any status), or null. Never reveals other users' rows. */
export async function findOwnVersion(userId: string, versionId: string, client: DbClient = db): Promise<CampaignVersion | null> {
  if (!versionId.trim()) return null;
  return client.campaignVersion.findFirst({ where: { id: versionId, campaign: { userId } } });
}

export async function getCampaignState(userId: string): Promise<CampaignState> {
  const campaign = await findLiveCampaign(db, userId);
  if (!campaign) return { campaign: null, inForce: null, pending: null, rulesInForce: null };
  return { campaign, ...splitVersions(await listVersions(db, campaign.id)) };
}
