import { findSkills } from "./skills";
import { matchedSkills, textForJob } from "./score";
import { tokenize } from "./text";

// Three-line fit summary for referral packets (brief sec. 5.4). Pure and conservative: every line is
// built from text that is actually in the resume or the posting. When there is nothing to say, the
// line says so instead of inventing a fit.

export interface FitSummaryJob {
  title: string;
  description: string | null;
  companyName: string;
}

const MAX_LINE = 160;
const MAX_SKILLS_IN_LINE = 4;
const ACTION_VERB =
  /\b(built|build|developed|designed|implemented|led|shipped|created|wrote|added|launched|optimi[sz]ed|reduced|improved|migrated|automated|deployed|scaled)\b/i;
const TEAM_HINT = /\b(team|teams|join|work on|build|building|help|platform|product|mission|you'll|you will)\b/i;
const SAMPLE_PREFIX = /^sample role\b/i;
const ABOUT_PREFIX = /^about (the|our) (team|role)\s*:\s*/i;

const NO_SKILLS = "No skills from the posting appear on the resume yet.";
const NO_PROJECT = "No project on the resume mentions this role's skills directly.";

/** Cut at the last word boundary that fits, adding an ellipsis. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

const withPeriod = (text: string): string => (/[.!?…]$/.test(text) ? text : `${text}.`);

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => part.replace(/^[\s\-–•*·]+/, "").trim())
    .filter(Boolean);
}

/** Header lines, contact details and comma-separated skill lists aren't "project" sentences. */
function looksLikeProse(line: string): boolean {
  if (line.length < 25 || line.includes("@")) return false;
  if (/^[A-Za-z /&]{2,30}:/.test(line) && (line.match(/,/g)?.length ?? 0) >= 2 && !ACTION_VERB.test(line)) return false;
  return /\s/.test(line);
}

function projectLine(resumeText: string, jobText: string, shared: readonly string[]): string {
  const jobTokens = new Set(tokenize(jobText));
  const sharedSet = new Set(shared);
  const scored = sentences(resumeText)
    .filter(looksLikeProse)
    .map((line, index) => {
      const skillHits = findSkills(line).filter((name) => sharedSet.has(name)).length;
      const tokenHits = new Set(tokenize(line).filter((token) => jobTokens.has(token))).size;
      const verb = ACTION_VERB.test(line) ? 1 : 0;
      return { line, index, skillHits, score: skillHits * 3 + tokenHits + verb * 2 };
    })
    .filter((entry) => entry.skillHits > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const best = scored[0];
  return best ? `Relevant work: ${withPeriod(truncateAtWord(best.line, MAX_LINE - 15))}` : NO_PROJECT;
}

function whyLine(job: FitSummaryJob): string {
  const company = job.companyName.trim() || "this company";
  const candidates = sentences(job.description ?? "")
    .filter((sentence) => !SAMPLE_PREFIX.test(sentence))
    .map((sentence) => sentence.replace(ABOUT_PREFIX, ""))
    .filter((sentence) => sentence.length >= 20);
  const pick = candidates.find((sentence) => TEAM_HINT.test(sentence)) ?? candidates[0];
  if (!pick) return `Why ${company}: the posting doesn't describe the team yet, so ask your contact what they work on.`;
  return `Why ${company}: ${withPeriod(truncateAtWord(pick, MAX_LINE - company.length - 6))}`;
}

export function fitSummary(resumeText: string, job: FitSummaryJob): [string, string, string] {
  const jobText = textForJob(job);
  const shared = matchedSkills(resumeText, jobText);
  const skills = shared.length
    ? `Matches the posting on ${joinList(shared.slice(0, MAX_SKILLS_IN_LINE))}.`
    : NO_SKILLS;
  return [skills, shared.length ? projectLine(resumeText, jobText, shared) : NO_PROJECT, whyLine(job)];
}
