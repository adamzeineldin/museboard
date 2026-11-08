import "server-only";
import type { CampaignVersion, Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parseCampaignRules, type ApprovedVia, type CampaignRules } from "@/lib/types";
import { actorForVia, type DbClient } from "./client";
import { rulesEqual } from "./equality";
import { findLiveCampaign, listVersions, splitVersions } from "./state";
import { assertEndsOnNotPast, assertResumeOwned, loadUserOrThrow, parseRulesOrThrow, parseViaOrThrow } from "./validate";

/**
 * - created: a new pending version (any earlier pending version is now superseded).
 * - unchanged_pending: the rules equal the current pending version, which is returned as-is.
 * - unchanged_in_force: no pending version and the rules equal the ones in force; nothing changed.
 * - withdrawn_pending: the rules equal the ones in force while a version was pending. The pending version is
 *   withdrawn (superseded, so it can no longer be approved) and the version in force is returned.
 */
export type ProposalOutcome = "created" | "unchanged_pending" | "unchanged_in_force" | "withdrawn_pending";

export interface ProposalResult {
  version: CampaignVersion;
  outcome: ProposalOutcome;
  /** The pending version this proposal replaced (it can no longer be approved), or null. */
  supersededVersionId: string | null;
}

interface WriteOutcome extends ProposalResult {
  createdCampaign: boolean;
  before: CampaignRules | null;
  previousPending: CampaignRules | null;
}

/** New versions must sort after every existing one, even when created within the same millisecond. */
function nextCreatedAt(versions: readonly CampaignVersion[], now: Date): Date {
  const latest = Math.max(0, ...versions.map((version) => version.createdAt.getTime()));
  return new Date(Math.max(now.getTime(), latest + 1));
}

interface ProposalInput {
  userId: string;
  rules: CampaignRules;
  now: Date;
  timeZone: string;
}

async function writeProposal(tx: DbClient, { userId, rules, now, timeZone }: ProposalInput): Promise<WriteOutcome> {
  const existing = await findLiveCampaign(tx, userId);
  // A campaign with no approved version is held paused; the first approval activates it.
  const campaign = existing ?? (await tx.campaign.create({ data: { userId, status: "paused" } }));
  const versions = await listVersions(tx, campaign.id);
  const { inForce, pending, rulesInForce } = splitVersions(versions);
  const previousPending = pending ? parseCampaignRules(pending.rules) : null;
  const base = { createdCampaign: !existing, before: rulesInForce, previousPending, supersededVersionId: null };

  if (inForce && rulesEqual(rules, rulesInForce)) {
    if (!pending) return { ...base, version: inForce, outcome: "unchanged_in_force" };
    // Reverting to the rules in force withdraws the pending proposal instead of adding a copy of them.
    await tx.campaignVersion.update({ where: { id: pending.id }, data: { supersededAt: now } });
    return { ...base, version: inForce, outcome: "withdrawn_pending", supersededVersionId: pending.id };
  }
  // Checked after the in-force branch: saving the rules in force (even ended ones) writes no new rules.
  assertEndsOnNotPast(rules.endsOn, timeZone, now, "The end date has already passed.");
  if (pending && rulesEqual(rules, previousPending)) return { ...base, version: pending, outcome: "unchanged_pending" };
  // Rules are immutable once created: retire the old pending version instead of rewriting it, so an
  // approval of its id (after the user saw its summary) can never approve different rules.
  if (pending) {
    await tx.campaignVersion.update({ where: { id: pending.id }, data: { supersededAt: now } });
  }
  const version = await tx.campaignVersion.create({
    data: {
      campaignId: campaign.id,
      rules: rules as unknown as Prisma.InputJsonValue,
      createdAt: nextCreatedAt(versions, now),
    },
  });
  return { ...base, version, outcome: "created", supersededVersionId: pending?.id ?? null };
}

async function auditProposal(
  tx: DbClient,
  userId: string,
  via: ApprovedVia,
  written: WriteOutcome,
  after: CampaignRules,
): Promise<void> {
  const actor = actorForVia(via);
  const campaignId = written.version.campaignId;
  if (written.outcome === "withdrawn_pending") {
    await writeAudit(
      userId,
      actor,
      "campaign.proposal_withdrawn",
      {
        campaignId,
        versionId: written.supersededVersionId,
        inForceVersionId: written.version.id,
        via,
        withdrawn: written.previousPending,
      },
      tx,
    );
    return;
  }
  if (written.outcome !== "created") return;
  await writeAudit(
    userId,
    actor,
    "campaign.proposed",
    {
      campaignId,
      versionId: written.version.id,
      via,
      createdCampaign: written.createdCampaign,
      replacedPending: written.supersededVersionId !== null,
      supersededVersionId: written.supersededVersionId,
      before: written.before,
      previousPending: written.previousPending,
      after,
    },
    tx,
  );
}

/**
 * Propose rules (ground rule 3: nothing changes until they are approved). Always creates a new pending
 * version and supersedes the previous pending one, except when the rules equal the pending version
 * (returned unchanged), or equal the version in force: with nothing pending that is a no-op, and with a
 * version pending it withdraws that version (audited as campaign.proposal_withdrawn). Starts a campaign
 * when the user has no active or paused one.
 */
export async function proposeRules(
  userId: string,
  rules: CampaignRules,
  via: ApprovedVia,
  now: Date = new Date(),
): Promise<ProposalResult> {
  const parsedVia = parseViaOrThrow(via);
  const parsed = parseRulesOrThrow(rules);
  const user = await loadUserOrThrow(db, userId);
  await assertResumeOwned(db, userId, parsed.resumeId);
  // Unchanged proposals change no state, so they write no audit entry here (an MCP call is still audited
  // as muse.propose_campaign by the tool layer). A state change and its audit commit together.
  const outcome = await db.$transaction(async (tx) => {
    const written = await writeProposal(tx, { userId, rules: parsed, now, timeZone: user.timezone });
    await auditProposal(tx, userId, parsedVia, written, parsed);
    return written;
  });
  return { version: outcome.version, outcome: outcome.outcome, supersededVersionId: outcome.supersededVersionId };
}

/** Contract wrapper (docs/ARCHITECTURE.md): the pending version, or the version in force when nothing changed. */
export async function proposeVersion(
  userId: string,
  rules: CampaignRules,
  via: ApprovedVia,
  now: Date = new Date(),
): Promise<CampaignVersion> {
  return (await proposeRules(userId, rules, via, now)).version;
}
