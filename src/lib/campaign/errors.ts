// Errors the campaign service throws. `message` is safe to show to the user as-is.

export type CampaignErrorCode = "invalid_rules" | "not_found" | "invalid_transition" | "already_approved" | "ended";

export class CampaignError extends Error {
  readonly code: CampaignErrorCode;

  constructor(code: CampaignErrorCode, message: string) {
    super(message);
    this.name = "CampaignError";
    this.code = code;
  }
}

export const isCampaignError = (error: unknown): error is CampaignError => error instanceof CampaignError;
