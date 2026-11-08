import "server-only";
import { db } from "@/lib/db";
import { actorSchema, approvedViaSchema, type Actor, type ApprovedVia } from "@/lib/types";
import { findLiveCampaign, listVersions, splitVersions } from "./state";

export type VersionState = "in_force" | "pending" | "superseded" | "unapproved";

export interface VersionHistoryEntry {
  id: string;
  /** 1-based, in creation order. */
  number: number;
  state: VersionState;
  createdAt: Date;
  approvedAt: Date | null;
  approvedVia: ApprovedVia | null;
  /** Who last proposed these rules, from the audit log. */
  proposedBy: Actor | null;
}

const PROPOSAL_SCAN_LIMIT = 500;

function versionIdOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).versionId;
  return typeof value === "string" ? value : null;
}

/** versionId -> actor of the newest 'campaign.proposed' event for it. */
async function proposers(userId: string): Promise<Map<string, Actor>> {
  const events = await db.auditEvent.findMany({
    where: { userId, action: "campaign.proposed" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PROPOSAL_SCAN_LIMIT,
  });
  const byVersion = new Map<string, Actor>();
  for (const event of events) {
    const versionId = versionIdOf(event.payload);
    const actor = actorSchema.safeParse(event.actor);
    if (versionId && actor.success && !byVersion.has(versionId)) byVersion.set(versionId, actor.data);
  }
  return byVersion;
}

/** Every version of the user's live campaign, newest first. */
export async function getCampaignHistory(userId: string): Promise<VersionHistoryEntry[]> {
  const campaign = await findLiveCampaign(db, userId);
  if (!campaign) return [];
  const [versions, proposedBy] = await Promise.all([listVersions(db, campaign.id), proposers(userId)]);
  const { inForce, pending } = splitVersions(versions);
  const stateOf = (id: string, approved: boolean): VersionState => {
    if (id === inForce?.id) return "in_force";
    if (id === pending?.id) return "pending";
    return approved ? "superseded" : "unapproved";
  };
  return versions
    .map((version, index) => {
      const via = approvedViaSchema.safeParse(version.approvedVia);
      return {
        id: version.id,
        number: index + 1,
        state: stateOf(version.id, version.approvedAt != null),
        createdAt: version.createdAt,
        approvedAt: version.approvedAt,
        approvedVia: via.success ? via.data : null,
        proposedBy: proposedBy.get(version.id) ?? null,
      };
    })
    .reverse();
}

/** Who proposed a version (from the audit log), or null when unknown. */
export async function versionProposedBy(userId: string, versionId: string): Promise<Actor | null> {
  return (await proposers(userId)).get(versionId) ?? null;
}
