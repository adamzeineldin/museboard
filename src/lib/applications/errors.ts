// Errors the applications service throws. `message` is safe to show to the user as-is.

export type ApplicationErrorCode =
  | "not_found"
  | "invalid_state"
  | "invalid_input"
  | "closed"
  | "no_resume"
  /** recordSubmission refused: the packet was never released and the release check fails now. */
  | "not_released";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  /** For 'not_released': the release check's user-safe reason (e.g. "Campaign is paused"). */
  readonly reason: string | null;

  constructor(code: ApplicationErrorCode, message: string, reason: string | null = null) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.reason = reason;
  }
}

export const isApplicationError = (error: unknown): error is ApplicationError => error instanceof ApplicationError;

export const APPLICATION_REASONS = {
  approvedByYou: "Approved by you",
  skippedByYou: "Skipped by you",
  /** Extra reason beyond RULE_REASONS: the user has no resume, so nothing can be prepared. */
  uploadResume: "Upload a resume first",
  /** The ingest closed the posting (Job.closedAt): it is never prepared, approved or released. */
  postingClosed: "This posting has closed.",
} as const;
