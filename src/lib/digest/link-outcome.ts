import { DigestConfigError, linkSecret } from "./config";
import { verifyLinkToken, type LinkClaims, type LinkPurpose } from "./tokens";

// Shared shape for the two one-click email links. `message` is always safe to show.

export type LinkStatus =
  | "ready" // valid link, the action is available (GET shows the button)
  | "done" // the action just happened (POST)
  | "already" // nothing to do: already paused / already unsubscribed
  | "not_applicable" // the link points at something that no longer exists or isn't running
  | "invalid"
  | "expired"
  | "error";

export interface LinkOutcome {
  status: LinkStatus;
  message: string;
}

export const LINK_MESSAGES = {
  invalid: "This link isn't valid. Open Inroad and sign in to make changes.",
  expired: "This link has expired (links work for 14 days). Open Inroad and sign in to make changes.",
  error: "We couldn't check this link right now. Nothing was changed. Try again in a few minutes.",
} as const;

export type ClaimsResult = { ok: true; claims: LinkClaims } | { ok: false; outcome: LinkOutcome };

export function checkLink(token: unknown, purpose: LinkPurpose, now: Date): ClaimsResult {
  let secret: string;
  try {
    secret = linkSecret();
  } catch (error) {
    console.error("[digest] email link check failed", error instanceof DigestConfigError ? error.message : "unknown error");
    return { ok: false, outcome: { status: "error", message: LINK_MESSAGES.error } };
  }
  const result = verifyLinkToken(token, purpose, secret, now);
  if (result.ok) return { ok: true, claims: result.claims };
  if (result.reason === "expired") return { ok: false, outcome: { status: "expired", message: LINK_MESSAGES.expired } };
  return { ok: false, outcome: { status: "invalid", message: LINK_MESSAGES.invalid } };
}

export function failure(scope: string, userId: string, error: unknown): LinkOutcome {
  console.error(`[digest] ${scope} failed`, { userId, error: error instanceof Error ? error.message : String(error) });
  return { status: "error", message: LINK_MESSAGES.error };
}
