import { formatShortDate } from "@/components/shell/format";
import { JOB_TYPES, type CampaignRules, type JobType } from "@/lib/types";

// Pure: the plain-English "What you're approving" sentences (prototype docs/reference/inroad.html).
// No server-only import, so client components can render the live summary while the user edits.

export interface SummaryPart {
  text: string;
  /** The values the user is agreeing to; rendered in bold. */
  strong?: true;
}

export type SummarySentence = SummaryPart[];

export type SummaryRules = Pick<
  CampaignRules,
  "roles" | "autoCompanies" | "askFirstCompanies" | "weeklyCap" | "minMatch" | "endsOn"
>;

export interface SummaryContext {
  resumeName: string;
}

const ROLE_LABELS: Record<JobType, string> = { intern: "internships", newgrad: "new grad roles" };
const FALLBACK_RESUME_NAME = "your resume";

const plain = (text: string): SummaryPart => ({ text });
const strong = (text: string): SummaryPart => ({ text, strong: true });

function roleList(roles: readonly string[]): string {
  const labels = JOB_TYPES.filter((type) => roles.includes(type)).map((type) => ROLE_LABELS[type]);
  return labels.join(" and ") || "no role types";
}

const companyList = (companies: readonly string[]): string => companies.join(", ");

function weeklyCapText(cap: number): string {
  return `${cap} application${cap === 1 ? "" : "s"} a week`;
}

function askFirstSentence(askFirst: readonly string[]): SummarySentence {
  if (askFirst.length === 0) return [plain("No companies set to ask first.")];
  return [
    plain("Never apply to "),
    strong(companyList(askFirst)),
    plain(" without asking me. Draft a referral ask instead."),
  ];
}

/** Sentences split into plain and strong parts, for rendering with emphasis. */
export function summarizeRuleParts(rules: SummaryRules, ctx: SummaryContext): SummarySentence[] {
  const resumeName = ctx.resumeName.trim() || FALLBACK_RESUME_NAME;
  return [
    [
      plain("Apply to "),
      strong(roleList(rules.roles)),
      plain(" at "),
      strong(companyList(rules.autoCompanies) || "no companies"),
      plain("."),
    ],
    [plain("Use "), strong(resumeName), plain(", only for roles at "), strong(`${rules.minMatch}%+`), plain(" match.")],
    [plain("At most "), strong(weeklyCapText(rules.weeklyCap)), plain(", until "), strong(formatShortDate(rules.endsOn)), plain(".")],
    askFirstSentence(rules.askFirstCompanies),
    [plain("Anything else, or any change to these rules, needs a new yes from me.")],
  ];
}

/** Plain sentences for the "What you're approving" panel (contract: docs/ARCHITECTURE.md). */
export function summarizeRules(rules: SummaryRules, ctx: SummaryContext): string[] {
  return summarizeRuleParts(rules, ctx).map((sentence) => sentence.map((part) => part.text).join(""));
}
