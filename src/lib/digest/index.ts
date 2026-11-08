import "server-only";

// Weekly digest email (brief sec. 5.3). See docs/ARCHITECTURE.md "src/lib/digest".
export { buildDigest, type BuiltDigest, type DigestSkipReason } from "./build";
export { appBaseUrl, DigestConfigError, digestLinkConfig, digestMailConfig, type DigestLinkConfig } from "./config";
export { buildDigestLinks, PAUSE_PATH, UNSUBSCRIBE_PATH } from "./links";
export { LINK_MESSAGES, type LinkOutcome, type LinkStatus } from "./link-outcome";
export { createDigestMailer, type DigestEnvelope, type DigestMailer } from "./mailer";
export { inspectPauseLink, pauseCampaignFromLink, PAUSED_VIA_EMAIL_ACTION } from "./pause-link";
export { renderDigest } from "./render";
export { DIGEST_SENT_ACTION, redactSecrets, sendWeeklyDigests, type DigestRunSummary } from "./send";
export { LINK_TOKEN_TTL_MS, signLinkToken, verifyLinkToken, type LinkPurpose } from "./tokens";
export type { DigestData, DigestLinks, DigestMessage } from "./types";
export { DIGEST_PREFERENCE_ACTION, DigestPreferenceError, setDigestEnabled, type DigestPreferenceResult } from "./preference";
export { inspectUnsubscribeLink, unsubscribeFromLink, UNSUBSCRIBED_VIA_EMAIL_ACTION } from "./unsubscribe-link";
export { digestWeek, type DigestWeek } from "./week";
