import "server-only";

// Campaign service. Contract: docs/ARCHITECTURE.md "Cross-module function contract".
// summarizeRules lives in the pure ./summary module so client components can import it directly.
export { approveVersion } from "./approve";
export { CampaignError, isCampaignError, type CampaignErrorCode } from "./errors";
export { getCampaignHistory, versionProposedBy, type VersionHistoryEntry, type VersionState } from "./history";
export { proposeVersion } from "./propose";
export { loadRuleCampaign, type RuleContext } from "./rule-campaign";
export { getCampaignState, type CampaignState } from "./state";
export { setCampaignStatus } from "./status";
export { summarizeRuleParts, summarizeRules, type SummaryPart, type SummarySentence } from "./summary";
export { checkStatusTransition, type SettableCampaignStatus } from "./transitions";
export { rulesEqual } from "./equality";
