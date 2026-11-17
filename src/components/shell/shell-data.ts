import "server-only";
import { weekCount } from "@/lib/applications";
import { listRecentAudit } from "@/lib/audit";
import { getCampaignState } from "@/lib/campaign";
import { effectiveCampaignStatus, isPastEnd } from "@/lib/campaign/ended";
import { db } from "@/lib/db";
import { campaignStatusSchema } from "@/lib/types";
import type { CampaignCardInput } from "./campaign-card-model";
import { museConnectionState, type MuseConnection } from "./muse-connection";
import { museEventModel, type MuseEventModel } from "./muse-event-model";

export interface ShellData {
  waitingCount: number;
  campaign: CampaignCardInput | null;
  museEvents: MuseEventModel[];
  museConnection: MuseConnection;
}

const MUSE_EVENT_LIMIT = 20;
// Only the tool-call rows: the services Muse calls also audit under actor 'muse', which would list each call twice.
const MUSE_TOOL_ACTION_PREFIX = "muse.";

async function safeWeekCount(userId: string, now: Date, timeZone: string): Promise<number | null> {
  try {
    return await weekCount(userId, now, timeZone);
  } catch (error) {
    // The shell renders on every page, so a failed count shows "–" rather than breaking navigation.
    console.error("[shell] weekCount failed", { userId, error: error instanceof Error ? error.message : error });
    return null;
  }
}

/**
 * The approved rules of the user's live campaign, or null. An active campaign whose end date has passed in the
 * user's zone reads "ended" (nothing writes that status; it is derived, as in checkApplication).
 */
async function campaignInForce(userId: string, now: Date, timeZone: string) {
  const { campaign, rulesInForce } = await getCampaignState(userId);
  if (!campaign || !rulesInForce) return null;
  const parsed = campaignStatusSchema.safeParse(campaign.status);
  if (!parsed.success || parsed.data === "revoked") return null;
  const status = parsed.data === "ended" ? "ended" : effectiveCampaignStatus(parsed.data, rulesInForce.endsOn, now, timeZone);
  return status === "revoked" ? null : { status, rules: rulesInForce };
}

async function museTokenCounts(userId: string) {
  const [active, used] = await Promise.all([
    db.connectorToken.count({ where: { userId, revokedAt: null } }),
    db.connectorToken.count({ where: { userId, revokedAt: null, lastUsedAt: { not: null } } }),
  ]);
  return { active, used };
}

/** The Muse activity log: recent tool calls plus whether Muse is really connected. */
export async function getMuseActivity(userId: string): Promise<Pick<ShellData, "museEvents" | "museConnection">> {
  const [events, tokenCounts] = await Promise.all([
    listRecentAudit(userId, { actor: "muse", actionPrefix: MUSE_TOOL_ACTION_PREFIX, limit: MUSE_EVENT_LIMIT }),
    museTokenCounts(userId),
  ]);
  return { museEvents: events.map(museEventModel), museConnection: museConnectionState(tokenCounts) };
}

/** Everything the signed-in shell (rail badge, campaign card, Muse panel) needs for one user. */
export async function getShellData(userId: string, timeZone: string, now: Date = new Date()): Promise<ShellData> {
  const [waitingCount, inForce, events, tokenCounts] = await Promise.all([
    db.application.count({ where: { userId, status: "waiting" } }),
    campaignInForce(userId, now, timeZone),
    listRecentAudit(userId, { actor: "muse", actionPrefix: MUSE_TOOL_ACTION_PREFIX, limit: MUSE_EVENT_LIMIT }),
    museTokenCounts(userId),
  ]);

  const campaign: CampaignCardInput | null = inForce
    ? {
        status: inForce.status,
        weeklyCap: inForce.rules.weeklyCap,
        endsOn: inForce.rules.endsOn,
        weekCount: await safeWeekCount(userId, now, timeZone),
        pastEnd: isPastEnd(inForce.rules.endsOn, now, timeZone),
      }
    : null;

  return {
    waitingCount,
    campaign,
    museEvents: events.map(museEventModel),
    museConnection: museConnectionState(tokenCounts),
  };
}
