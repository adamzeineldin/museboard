import type { OutreachKind } from "@/lib/types";
import { isAlumRelationship, relationshipTie } from "./ranking";

// Deterministic outreach templates. No LLM, no network: the same inputs always produce the same draft.
// TODO(llm): this is the one place an LLM could rewrite the draft for tone. If one is added it must run
// after composeDraft, keep every hard rule below (under MAX_DRAFT_WORDS, first name only, the easy out,
// no reward language via containsRewardLanguage), and fall back to this template on any failure.
// Inroad only drafts. The user sends the message from their own account (ground rule 4).

/** Drafts must be strictly shorter than this many words. */
export const MAX_DRAFT_WORDS = 120;

export const EASY_OUT = "Either way, thanks for reading.";

const ROLE_WORDS = 8;
const TITLE_WORDS = 12;
const FIT_WORDS = 25;
const NAME_WORDS = 6;

export interface DraftInput {
  kind: OutreachKind;
  contact: { name: string; role: string; relationship: string; notes?: string | null };
  companyName: string;
  job: { title: string } | null;
  /** One line from the fit summary. Omitted when there is no resume to back it up. */
  fitLine?: string | null;
  sender: { name?: string | null; school?: string | null };
}

const HONORIFICS = /^(dr|mr|mrs|ms|mx|prof)\.?$/i;

/** First name only: "Priya N." -> "Priya", "Lee, Dana" -> "Dana", "Dr. Dana Lee" -> "Dana". */
export function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "there";
  const ordered = trimmed.includes(",") ? trimmed.split(",").slice(1).join(" ").trim() || trimmed : trimmed;
  const words = ordered.split(/\s+/).filter((word) => !HONORIFICS.test(word));
  return words[0] ?? "there";
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

const REWARD_PATTERN =
  /\b(pay|paying|paid|payment|reward\w*|gift[\s-]?cards?|giftcards?|bonus(?:es)?|compensat\w*|money|cash|venmo|paypal|zelle|incentives?|kickback)\b|\$\s?\d/i;

/** True when text offers money or rewards. Inroad never offers anything for a referral (ground rule 5). */
export function containsRewardLanguage(text: string): boolean {
  return REWARD_PATTERN.test(text);
}

function clampWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, max).join(" ");
}

function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

function asSentence(line: string): string {
  const trimmed = line.trim().replace(/^your\b/i, "My");
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const SKILLS_LINE = /^Matches the posting on (.+?)\.?$/i;
const NOTHING_TO_SAY = /^no\b/i;

/**
 * Turn the first fit-summary line (written about the user, e.g. "Matches the posting on Go and React.") into
 * a first-person line the user can send. Returns null when the line says there is nothing to report.
 */
export function draftFitLine(line: string | null | undefined): string | null {
  const trimmed = line?.trim() ?? "";
  if (!trimmed || NOTHING_TO_SAY.test(trimmed)) return null;
  const skills = SKILLS_LINE.exec(trimmed);
  if (skills) return `I've worked with ${skills[1]}, which the posting asks for.`;
  return asSentence(trimmed);
}

interface Parts {
  greeting: string;
  intro: string;
  ask: string;
  fit: string | null;
  packet: string | null;
  close: string;
  signature: string | null;
}

function buildParts(input: DraftInput): Parts {
  const company = clampWords(input.companyName, NAME_WORDS);
  const role = clampWords(input.contact.role, ROLE_WORDS);
  const school = input.sender.school ? clampWords(input.sender.school, NAME_WORDS) : "";
  const alum = isAlumRelationship(input.contact.relationship, input.contact.notes);
  const known = relationshipTie(input.contact.relationship, input.contact.notes) === "known";
  const title = input.job ? clampWords(input.job.title, TITLE_WORDS) : null;

  const where = role ? `you're ${withArticle(role)} at ${company}` : `you're at ${company}`;
  const tie = alum ? (school ? `, and a fellow ${school} alum` : ", and an alum of my school") : "";
  const studentAt = school && !alum ? ` at ${school}` : "";
  const intro = `I'm a student${studentAt} and saw ${where}${tie}.${known ? " It was good to connect before." : ""}`;

  const ask =
    input.kind === "coffee_chat"
      ? title
        ? `I'm interested in the ${title} role and would value 15 minutes of your perspective on the team before I apply.`
        : `I'm interested in software engineering roles at ${company} and would value 15 minutes of your perspective on the team.`
      : title
        ? `I'm applying to the ${title} role and wondered if you'd be comfortable referring me.`
        : `I'm hoping to apply to software engineering roles at ${company} and wondered if you'd be comfortable referring me when one opens.`;

  const fit = input.fitLine?.trim() ? asSentence(clampWords(input.fitLine, FIT_WORDS)) : null;
  const packet =
    input.kind === "referral_ask"
      ? "I've put together a short packet (posting link, a three-line fit summary and my resume) so it takes about two minutes."
      : null;
  const close = input.kind === "coffee_chat" ? `No pressure if now's a busy time. ${EASY_OUT}` : `If you'd rather not, no worries at all. ${EASY_OUT}`;
  const sender = input.sender.name?.trim() ? firstName(input.sender.name) : null;

  return { greeting: `Hi ${firstName(input.contact.name)},`, intro, ask, fit, packet, close, signature: sender };
}

function render(parts: Parts): string {
  const body = [parts.intro, parts.ask].join(" ");
  const paragraphs = [parts.greeting, body, parts.fit, [parts.packet, parts.close].filter(Boolean).join(" "), parts.signature];
  return paragraphs.filter((p): p is string => Boolean(p)).join("\n\n");
}

/**
 * Compose a short, specific coffee-chat or referral-ask draft with an easy out. Optional pieces are dropped
 * (fit line first, then the packet sentence) until the draft is under MAX_DRAFT_WORDS.
 */
export function composeDraft(input: DraftInput): string {
  const parts = buildParts(input);
  const attempts: Parts[] = [parts, { ...parts, fit: null }, { ...parts, fit: null, packet: null }];
  for (const attempt of attempts) {
    const draft = render(attempt);
    if (wordCount(draft) < MAX_DRAFT_WORDS) return draft;
  }
  return render({ ...parts, fit: null, packet: null, signature: null });
}
