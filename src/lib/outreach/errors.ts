// Errors whose message is safe to show to the user as-is. Anything else is logged and replaced with a generic message.

export type OutreachErrorCode = "not_found" | "invalid" | "duplicate";

export class OutreachError extends Error {
  readonly code: OutreachErrorCode;

  constructor(code: OutreachErrorCode, message: string) {
    super(message);
    this.name = "OutreachError";
    this.code = code;
  }
}

export const contactNotFound = (): OutreachError => new OutreachError("not_found", "Contact not found.");
export const draftNotFound = (): OutreachError => new OutreachError("not_found", "Draft not found.");
export const jobNotFound = (): OutreachError => new OutreachError("not_found", "Job not found.");

/** The message to show a user for any thrown value. */
export function userMessage(error: unknown, fallback: string): string {
  return error instanceof OutreachError ? error.message : fallback;
}
