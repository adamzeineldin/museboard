// Rule engine (brief sec. 4): pure functions, no DB access.
export { checkApplication } from "./check";
export { pendingVersion, pickVersionInForce, type VersionLike } from "./versions";
export {
  addDaysToIsoDate,
  isoWeekRange,
  isoWeekStart,
  isValidTimeZone,
  localDateString,
  startOfLocalDay,
  type InstantRange,
} from "./time";
export {
  RULE_REASONS,
  type RuleCampaign,
  type RuleCheckResult,
  type RuleJob,
  type RuleMatch,
  type RuleSet,
} from "./types";
