import "server-only";
import type { Campaign, CampaignVersion } from "@/generated/prisma/client";
import { notImplemented } from "@/lib/not-implemented";
import type { ApprovedVia, CampaignRules } from "@/lib/types";

// Contract: docs/ARCHITECTURE.md "Cross-module function contract". Implemented in milestone 5.

export interface CampaignState {
  campaign: Campaign | null;
  inForce: CampaignVersion | null;
  pending: CampaignVersion | null;
  rulesInForce: CampaignRules | null;
}

export type SettableCampaignStatus = "active" | "paused" | "revoked";

export async function getCampaignState(userId: string): Promise<CampaignState> {
  return notImplemented("getCampaignState", userId);
}

/** Plain sentences for the "What you're approving" panel. */
export function summarizeRules(rules: CampaignRules, ctx: { resumeName: string }): string[] {
  return notImplemented("summarizeRules", rules, ctx);
}

export async function proposeVersion(userId: string, rules: CampaignRules, via: ApprovedVia): Promise<CampaignVersion> {
  return notImplemented("proposeVersion", userId, rules, via);
}

export async function approveVersion(userId: string, versionId: string, via: ApprovedVia): Promise<CampaignVersion> {
  return notImplemented("approveVersion", userId, versionId, via);
}

export async function setCampaignStatus(userId: string, status: SettableCampaignStatus): Promise<Campaign> {
  return notImplemented("setCampaignStatus", userId, status);
}
