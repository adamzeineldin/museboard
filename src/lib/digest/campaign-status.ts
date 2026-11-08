import "server-only";
import { getCampaignState, loadRuleCampaign } from "@/lib/campaign";
import { weekCount } from "@/lib/applications";
import { checkApplication, RULE_REASONS } from "@/lib/rules";
import type { DigestCampaign, DigestCampaignKind } from "./types";
import type { DigestWeek } from "./week";

// The campaign block of the digest. Status semantics come from the rule engine (checkApplication's first
// three checks: approved version, paused, ended), not from a copy of them here.

/** Fails every company check, so only the campaign-level checks decide the reason. */
const PROBE_JOB = { companyName: "", type: null } as const;

const KIND_BY_REASON: Record<string, DigestCampaignKind> = {
  [RULE_REASONS.noApprovedVersion]: "not_approved",
  [RULE_REASONS.paused]: "paused",
  [RULE_REASONS.ended]: "ended",
};

export async function loadDigestCampaign(userId: string, week: DigestWeek, now: Date): Promise<DigestCampaign> {
  const [rule, state, count] = await Promise.all([
    loadRuleCampaign(userId, week.timeZone),
    getCampaignState(userId),
    // Any instant inside the digest week selects that week.
    weekCount(userId, week.start, week.timeZone),
  ]);
  const base = {
    campaignId: state.campaign?.id ?? null,
    weekCount: count,
    weeklyCap: rule.rules?.weeklyCap ?? null,
    endsOn: rule.rules?.endsOn ?? null,
    hasPendingChanges: Boolean(state.pending && state.inForce),
  };
  if (!rule.ruleCampaign) return { ...base, kind: "none" };
  if (rule.ruleCampaign.status === "revoked") return { ...base, kind: "revoked", campaignId: null };
  const probe = checkApplication(PROBE_JOB, null, rule.ruleCampaign, 0, now);
  return { ...base, kind: KIND_BY_REASON[probe.reason] ?? "active" };
}
