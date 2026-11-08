import "server-only";
import type { CampaignVersion } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseCampaignRules, type ApprovedVia, type CampaignRules } from "@/lib/types";
import { actorForVia, LIVE_STATUSES, type DbClient } from "./client";
import { CampaignError, STALE_VERSION_MESSAGE } from "./errors";
import { listVersions, splitVersions } from "./state";
import { assertEndsOnNotPast, assertResumeOwned, loadUserOrThrow, parseViaOrThrow } from "./validate";

interface ApproveOutcome {
  version: CampaignVersion;
  before: CampaignRules | null;
  after: CampaignRules;
  firstApproval: boolean;
}

const notFound = () => new CampaignError("not_found", "We couldn't find that campaign version.");

async function writeApproval(
  tx: DbClient,
  userId: string,
  versionId: string,
  via: ApprovedVia,
  timeZone: string,
  now: Date,
): Promise<ApproveOutcome> {
  const target = await tx.campaignVersion.findUnique({ where: { id: versionId }, include: { campaign: true } });
  if (!target || target.campaign.userId !== userId) throw notFound();
  if (target.approvedAt) throw new CampaignError("already_approved", "That version is already approved.");
  if (!(LIVE_STATUSES as readonly string[]).includes(target.campaign.status)) throw notFound();

  // Only the current pending version can be approved: a version a newer proposal replaced (supersededAt) is
  // stale, because the summary the user said yes to is no longer what would go into force.
  const { inForce, pending, rulesInForce } = splitVersions(await listVersions(tx, target.campaignId));
  if (target.supersededAt || pending?.id !== target.id) throw new CampaignError("stale_version", STALE_VERSION_MESSAGE);
  const after = parseCampaignRules(target.rules);
  if (!after) throw new CampaignError("invalid_rules", "That version's rules aren't valid. Edit and save them again.");
  assertEndsOnNotPast(after.endsOn, timeZone, now, "This version's end date has passed. Pick a new end date first.");
  await assertResumeOwned(tx, userId, after.resumeId);

  const campaign = target.campaign;
  const version = await tx.campaignVersion.update({
    where: { id: target.id },
    data: { approvedAt: now, approvedVia: via, approvedBy: userId },
  });
  const firstApproval = !inForce;
  if (firstApproval && campaign.status !== "active") {
    await tx.campaign.update({ where: { id: campaign.id }, data: { status: "active" } });
  }
  return { version, before: rulesInForce, after, firstApproval };
}

/**
 * Approve exactly `versionId`, which must be the current pending version of the user's own campaign
 * (else CampaignError 'stale_version'). Version rules never change after creation, so what the caller
 * showed for this id is what goes into force. The first approval activates the campaign.
 */
export async function approveVersion(
  userId: string,
  versionId: string,
  via: ApprovedVia,
  now: Date = new Date(),
): Promise<CampaignVersion> {
  const parsedVia = parseViaOrThrow(via);
  if (typeof versionId !== "string" || !versionId.trim()) throw notFound();
  const user = await loadUserOrThrow(db, userId);
  // The approval and its consent record commit (or roll back) together.
  const outcome = await db.$transaction(async (tx) => {
    const approval = await writeApproval(tx, userId, versionId, parsedVia, user.timezone, now);
    await writeAudit(
      userId,
      actorForVia(parsedVia),
      "campaign.approved",
      {
        campaignId: approval.version.campaignId,
        versionId: approval.version.id,
        via: parsedVia,
        firstApproval: approval.firstApproval,
        before: approval.before,
        after: approval.after,
      },
      tx,
    );
    return approval;
  });
  return outcome.version;
}
