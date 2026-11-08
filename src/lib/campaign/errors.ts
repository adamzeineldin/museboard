// Errors the campaign service throws. `message` is safe to show to the user as-is.

export type CampaignErrorCode =
  | "invalid_rules"
  | "not_found"
  | "invalid_transition"
  | "already_approved"
  | "ended"
  /** The version was replaced by a newer proposal after the caller showed its summary. */
  | "stale_version";

export const STALE_VERSION_MESSAGE =
  "These rules changed after you reviewed them. Review the latest summary and approve again.";

export class CampaignError extends Error {
  readonly code: CampaignErrorCode;

  constructor(code: CampaignErrorCode, message: string) {
    super(message);
    this.name = "CampaignError";
    this.code = code;
  }
}

export const isCampaignError = (error: unknown): error is CampaignError => error instanceof CampaignError;
