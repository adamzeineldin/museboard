import "server-only";

// Applications service. Contract: docs/ARCHITECTURE.md "Cross-module function contract",
// "Application lifecycle", "weekCount" and "Weekly pass candidates".
export { getActivity, sortActivity, type ActivityData, type ActivityEvent, type ActivityItem, type ActivityStats } from "./activity";
export { approveWaiting, skipWaiting } from "./decide";
export { APPLICATION_REASONS, ApplicationError, isApplicationError, type ApplicationErrorCode } from "./errors";
export { evaluateJobForUser } from "./evaluate";
export { prepareApplication } from "./prepare";
export { checkRelease, getReleaseVerdicts, type ReleaseVerdict } from "./release";
export { CONFIRMATION_MAX, getSubmissionPacket, recordSubmission } from "./submit";
export type { EvaluationResult, StoredCheckResult, SubmissionPacketResult, WeeklyPassSummary } from "./types";
export { weekCount } from "./week-count";
export { runWeeklyPass } from "./weekly-pass";
