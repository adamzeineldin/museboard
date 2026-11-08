import type { CampaignStatus } from "@/lib/types";

// Pure: which campaign status changes are allowed (pause / resume / revoke). Revoked and ended are terminal.

export type SettableCampaignStatus = "active" | "paused" | "revoked";

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

const deny = (reason: string): TransitionCheck => ({ ok: false, reason });

export function checkStatusTransition(
  current: CampaignStatus,
  target: SettableCampaignStatus,
  hasApprovedVersion: boolean,
): TransitionCheck {
  if (current === "revoked") return deny("This campaign was revoked. Approve new rules to start a new one.");
  if (current === "ended") return deny("This campaign has ended. Approve new rules to start a new one.");
  if (target === "revoked") return { ok: true };
  if (!hasApprovedVersion) return deny("Approve the campaign first.");
  if (current === target) return deny(`The campaign is already ${target}.`);
  return { ok: true };
}
