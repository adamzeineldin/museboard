import "server-only";

// Campaign service. Contract: docs/ARCHITECTURE.md "Cross-module function contract".
// summarizeRules lives in the pure ./summary module so client components can import it directly.
export { approveVersion } from "./approve";
export { CampaignError, isCampaignError, STALE_VERSION_MESSAGE, type CampaignErrorCode } from "./errors";
export { getCampaignHistory, versionProposedBy, type VersionHistoryEntry, type VersionState } from "./history";
export { proposeRules, proposeVersion, type ProposalOutcome, type ProposalResult } from "./propose";
export { loadRuleCampaign, type RuleContext } from "./rule-campaign";
export { findOwnVersion, getCampaignState, type CampaignState } from "./state";
export { setCampaignStatus } from "./status";
export { summarizeRuleParts, summarizeRules, type SummaryPart, type SummarySentence } from "./summary";
export { checkStatusTransition, type SettableCampaignStatus } from "./transitions";
export { rulesEqual } from "./equality";
