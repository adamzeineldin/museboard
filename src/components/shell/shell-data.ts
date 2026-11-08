import "server-only";
import { weekCount } from "@/lib/applications";
import { listRecentAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { campaignStatusSchema, parseCampaignRules } from "@/lib/types";
import type { CampaignCardInput } from "./campaign-card-model";
import { museEventModel, type MuseEventModel } from "./muse-event-model";

export interface ShellData {
  waitingCount: number;
  campaign: CampaignCardInput | null;
  museEvents: MuseEventModel[];
  museConnected: boolean;
}

const MUSE_EVENT_LIMIT = 20;

async function safeWeekCount(userId: string, now: Date, timeZone: string): Promise<number | null> {
  try {
    return await weekCount(userId, now, timeZone);
  } catch (error) {
    // Until milestone 5 implements weekCount this is a stub; show "–" rather than breaking the shell.
    console.error("[shell] weekCount failed", { userId, error: error instanceof Error ? error.message : error });
    return null;
  }
}

/**
 * The approved rules of the user's live (active or paused) campaign, or null.
 * TODO(milestone 5): switch to getCampaignState() from @/lib/campaign once it is implemented.
 */
async function campaignInForce(userId: string) {
  const campaign = await db.campaign.findFirst({
    where: { userId, status: { in: ["active", "paused"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!campaign) return null;
  const version = await db.campaignVersion.findFirst({
    where: { campaignId: campaign.id, approvedAt: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  const rules = version ? parseCampaignRules(version.rules) : null;
  const status = campaignStatusSchema.safeParse(campaign.status);
  if (!rules || !status.success) return null;
  return { status: status.data, rules };
}

/** Everything the signed-in shell (rail badge, campaign card, Muse panel) needs for one user. */
export async function getShellData(userId: string, timeZone: string, now: Date = new Date()): Promise<ShellData> {
  const [waitingCount, inForce, events, connectorCount] = await Promise.all([
    db.application.count({ where: { userId, status: "waiting" } }),
    campaignInForce(userId),
    listRecentAudit(userId, { actor: "muse", limit: MUSE_EVENT_LIMIT }),
    db.connectorToken.count({ where: { userId, revokedAt: null } }),
  ]);

  const campaign: CampaignCardInput | null = inForce
    ? {
        status: inForce.status,
        weeklyCap: inForce.rules.weeklyCap,
        endsOn: inForce.rules.endsOn,
        weekCount: await safeWeekCount(userId, now, timeZone),
      }
    : null;

  return {
    waitingCount,
    campaign,
    museEvents: events.map(museEventModel),
    museConnected: connectorCount > 0,
  };
}
