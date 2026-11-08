import "server-only";
import type { CampaignVersion, Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseCampaignRules, type ApprovedVia, type CampaignRules } from "@/lib/types";
import { actorForVia, type DbClient } from "./client";
import { findLiveCampaign, listVersions, splitVersions } from "./state";
import { assertEndsOnNotPast, assertResumeOwned, loadUserOrThrow, parseRulesOrThrow, parseViaOrThrow } from "./validate";

interface ProposeOutcome {
  version: CampaignVersion;
  createdCampaign: boolean;
  replacedPending: boolean;
  before: CampaignRules | null;
  previousPending: CampaignRules | null;
}

/** New versions must sort after every existing one, even when created within the same millisecond. */
function nextCreatedAt(versions: readonly CampaignVersion[], now: Date): Date {
  const latest = Math.max(0, ...versions.map((version) => version.createdAt.getTime()));
  return new Date(Math.max(now.getTime(), latest + 1));
}

async function writeProposal(tx: DbClient, userId: string, rules: CampaignRules, now: Date): Promise<ProposeOutcome> {
  const existing = await findLiveCampaign(tx, userId);
  // A campaign with no approved version is held paused; the first approval activates it.
  const campaign = existing ?? (await tx.campaign.create({ data: { userId, status: "paused" } }));
  const versions = await listVersions(tx, campaign.id);
  const { pending, rulesInForce } = splitVersions(versions);
  const json = rules as unknown as Prisma.InputJsonValue;
  const version = pending
    ? await tx.campaignVersion.update({ where: { id: pending.id }, data: { rules: json } })
    : await tx.campaignVersion.create({
        data: { campaignId: campaign.id, rules: json, createdAt: nextCreatedAt(versions, now) },
      });
  return {
    version,
    createdCampaign: !existing,
    replacedPending: Boolean(pending),
    before: rulesInForce,
    previousPending: pending ? parseCampaignRules(pending.rules) : null,
  };
}

/**
 * Create the pending version, or replace the rules of the existing pending version (ground rule 3:
 * nothing changes until it is approved). Starts a campaign when the user has no active or paused one.
 */
export async function proposeVersion(
  userId: string,
  rules: CampaignRules,
  via: ApprovedVia,
  now: Date = new Date(),
): Promise<CampaignVersion> {
  const parsedVia = parseViaOrThrow(via);
  const parsed = parseRulesOrThrow(rules);
  const user = await loadUserOrThrow(db, userId);
  assertEndsOnNotPast(parsed.endsOn, user.timezone, now, "The end date has already passed.");
  await assertResumeOwned(db, userId, parsed.resumeId);

  const outcome = await db.$transaction((tx) => writeProposal(tx, userId, parsed, now));
  await writeAudit(userId, actorForVia(parsedVia), "campaign.proposed", {
    campaignId: outcome.version.campaignId,
    versionId: outcome.version.id,
    via: parsedVia,
    createdCampaign: outcome.createdCampaign,
    replacedPending: outcome.replacedPending,
    before: outcome.before,
    previousPending: outcome.previousPending,
    after: parsed,
  });
  return outcome.version;
}
