// Errors the applications service throws. `message` is safe to show to the user as-is.

export type ApplicationErrorCode = "not_found" | "invalid_state" | "invalid_input" | "closed" | "no_resume";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;

  constructor(code: ApplicationErrorCode, message: string) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
  }
}

export const isApplicationError = (error: unknown): error is ApplicationError => error instanceof ApplicationError;

export const APPLICATION_REASONS = {
  approvedByYou: "Approved by you",
  skippedByYou: "Skipped by you",
  /** Extra reason beyond RULE_REASONS: the user has no resume, so nothing can be prepared. */
  uploadResume: "Upload a resume first",
} as const;
