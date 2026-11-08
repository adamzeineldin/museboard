import "server-only";
import { db } from "@/lib/db";
import { digestLinkConfig, type DigestLinkConfig } from "./config";
import { buildDigestLinks } from "./links";
import { hasSomethingToReport, loadDigestData } from "./load";
import { renderDigest } from "./render";
import type { DigestData, DigestLinks, DigestMessage } from "./types";

export type DigestSkipReason = "no_user" | "opted_out" | "nothing_to_report";

export type BuiltDigest =
  | { status: "skipped"; reason: DigestSkipReason }
  | { status: "ready"; to: string; data: DigestData; links: DigestLinks; message: DigestMessage };

/**
 * Load and render one user's weekly digest for the ISO week that ended at or before `now`, in their time
 * zone. Read-only. Skips users who opted out, and users with nothing to report and no active campaign.
 */
export async function buildDigest(userId: string, now: Date, config: DigestLinkConfig = digestLinkConfig()): Promise<BuiltDigest> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, timezone: true, digestOptOut: true },
  });
  if (!user) return { status: "skipped", reason: "no_user" };
  if (user.digestOptOut) return { status: "skipped", reason: "opted_out" };

  const data = await loadDigestData(user, now);
  if (!hasSomethingToReport(data) && data.campaign.kind !== "active") return { status: "skipped", reason: "nothing_to_report" };

  const pauseCampaignId = data.campaign.kind === "active" ? data.campaign.campaignId : null;
  const links = buildDigestLinks({ userId: user.id, pauseCampaignId }, config, now);
  return { status: "ready", to: user.email, data, links, message: renderDigest(data, links) };
}
