import { formatRelative } from "@/components/shell/format";
import { warmPathsHref } from "@/components/warm-paths/selection";
import type { ChipTone } from "@/components/ui/Chip";
import type { RuleCheckResult } from "@/lib/rules";
import { evaluateJobs, type RuleInputs } from "./rule-batch";

// Pure view model for the Jobs feed (prototype vMatches). The page loads rows; this decides what
// each card says, which jobs a filter shows, and in what order.

export const JOB_FILTERS = [
  { value: "recommended", label: "Recommended" },
  { value: "intern", label: "Internships" },
  { value: "newgrad", label: "New grad" },
  { value: "warm", label: "Has a warm path" },
] as const;

export type JobFilter = (typeof JOB_FILTERS)[number]["value"];

export const FEED_PAGE_SIZE = 50;
export const FEED_MAX_LIMIT = 500;

export interface FeedJob {
  id: string;
  title: string;
  location: string;
  type: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  source: string;
  compensation: string | null;
  url: string;
  companyId: string;
  companyName: string;
}

export interface FeedMatch {
  score: number;
  skills: string[];
}

export interface FeedApplication {
  status: string;
  decidedBy: string;
}

export interface FeedContact {
  id: string;
  name: string;
}

export interface FeedInput {
  jobs: readonly FeedJob[];
  matches: ReadonlyMap<string, FeedMatch>;
  applications: ReadonlyMap<string, FeedApplication>;
  /** companyId -> contacts, warmest first (contactsByCompany). */
  contacts: ReadonlyMap<string, readonly FeedContact[]>;
  rules: RuleInputs;
  filter: JobFilter;
  limit: number;
  now: Date;
}

export interface StatusChipModel {
  tone: ChipTone;
  label: string;
}

export interface WarmPathModel {
  contactId: string;
  label: string;
  referralHref: string;
}

export interface JobCardModel {
  id: string;
  title: string;
  companyName: string;
  companyInitials: string;
  postedLabel: string;
  source: string;
  tags: string[];
  chip: StatusChipModel;
  warmPath: WarmPathModel | null;
  score: number | null;
  skills: string[];
  /** The posting link, only when it is a plain http(s) URL. */
  postingUrl: string | null;
  applicationStatus: string | null;
}

export interface FeedResult {
  cards: JobCardModel[];
  totalOpen: number;
  totalFiltered: number;
  newMatchCount: number;
  hasMore: boolean;
  nextLimit: number;
}

const FILTER_VALUES: readonly string[] = JOB_FILTERS.map((f) => f.value);

export function parseJobFilter(value: string | string[] | undefined): JobFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && FILTER_VALUES.includes(raw) ? (raw as JobFilter) : "recommended";
}

/** "?show=" rounded up to whole pages, between one page and FEED_MAX_LIMIT. */
export function parseShowLimit(value: string | string[] | undefined): number {
  const raw = Number.parseInt((Array.isArray(value) ? value[0] : value) ?? "", 10);
  if (!Number.isFinite(raw) || raw <= FEED_PAGE_SIZE) return FEED_PAGE_SIZE;
  return Math.min(FEED_MAX_LIMIT, Math.ceil(raw / FEED_PAGE_SIZE) * FEED_PAGE_SIZE);
}

/** Link for a filter pill (the "Recommended" feed is plain /jobs). */
export function filterHref(filter: JobFilter): string {
  return filter === "recommended" ? "/jobs" : `/jobs?filter=${filter}`;
}

/** "Show more" link: same filter, a larger ?show= limit. */
export function showMoreHref(filter: JobFilter, limit: number): string {
  const base = filterHref(filter);
  return `${base}${base.includes("?") ? "&" : "?"}show=${limit}`;
}

const APPLICATION_CHIPS: Record<string, StatusChipModel> = {
  prepared: { tone: "ok", label: "Ready to submit" },
  waiting: { tone: "hold", label: "Waiting on you" },
  skipped: { tone: "neutral", label: "Skipped" },
};

/** An existing Application wins; otherwise the rule check decides (prototype statusChip). */
export function statusChip(result: RuleCheckResult | null, application: FeedApplication | null): StatusChipModel {
  if (application) {
    if (application.status === "submitted") {
      return { tone: "ok", label: application.decidedBy === "user" ? "Applied · approved by you" : "Applied" };
    }
    const chip = APPLICATION_CHIPS[application.status];
    if (chip) return chip;
  }
  if (!result) return { tone: "neutral", label: "Rule check unavailable" };
  if (result.ok) return { tone: "ok", label: "Will auto-apply" };
  return { tone: result.topChoice ? "warm" : "neutral", label: result.reason };
}

export function companyInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  return letters || "?";
}

export function postedLabel(job: Pick<FeedJob, "postedAt" | "firstSeenAt">, now: Date): string {
  return formatRelative(job.postedAt ?? job.firstSeenAt, now);
}

export function jobTags(job: Pick<FeedJob, "location" | "type" | "compensation">): string[] {
  const location = job.location.trim() || "Location not listed";
  const kind = job.type === "intern" ? "Internship" : "Full-time";
  const pay = job.compensation?.trim();
  return pay ? [location, kind, pay] : [location, kind];
}

export interface FeedHeaderModel {
  title: string;
  subtitle: string;
  resumeName: string | null;
}

export function feedHeader(newMatchCount: number, totalOpen: number, resumeName: string | null): FeedHeaderModel {
  if (!resumeName) {
    return {
      title: `${totalOpen} open role${totalOpen === 1 ? "" : "s"}`,
      subtitle: "From public company job feeds. Upload a resume to rank them against your experience.",
      resumeName: null,
    };
  }
  return {
    title: `${newMatchCount} new match${newMatchCount === 1 ? "" : "es"} for you`,
    subtitle: "From public company job feeds, ranked against",
    resumeName,
  };
}

/** Only http(s) links are rendered, so a bad feed value can't become a javascript: URL. */
export function safePostingUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const recency = (job: FeedJob): number => (job.postedAt ?? job.firstSeenAt).getTime();

function compareJobs(matches: FeedInput["matches"]) {
  return (a: FeedJob, b: FeedJob): number => {
    const scoreA = matches.get(a.id)?.score ?? Number.NEGATIVE_INFINITY;
    const scoreB = matches.get(b.id)?.score ?? Number.NEGATIVE_INFINITY;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return recency(b) - recency(a) || a.id.localeCompare(b.id);
  };
}

function passesFilter(job: FeedJob, filter: JobFilter, contacts: FeedInput["contacts"]): boolean {
  if (filter === "intern" || filter === "newgrad") return job.type === filter;
  if (filter === "warm") return (contacts.get(job.companyId)?.length ?? 0) > 0;
  return true;
}

function warmPathFor(job: FeedJob, contacts: FeedInput["contacts"]): WarmPathModel | null {
  const first = contacts.get(job.companyId)?.[0];
  if (!first) return null;
  const referralHref = warmPathsHref({ contactId: first.id, jobId: job.id, kind: "referral_ask" });
  return { contactId: first.id, label: `${first.name} works here`, referralHref };
}

export function buildJobCards(input: FeedInput): FeedResult {
  const filtered = input.jobs.filter((job) => passesFilter(job, input.filter, input.contacts));
  const page = [...filtered].sort(compareJobs(input.matches)).slice(0, input.limit);
  const scores = new Map([...input.matches].map(([jobId, match]) => [jobId, match.score]));
  const results = evaluateJobs(page, scores, input.rules, input.now);

  const cards = page.map((job): JobCardModel => {
    const match = input.matches.get(job.id) ?? null;
    return {
      id: job.id,
      title: job.title,
      companyName: job.companyName,
      companyInitials: companyInitials(job.companyName),
      postedLabel: postedLabel(job, input.now),
      source: job.source,
      tags: jobTags(job),
      chip: statusChip(results.get(job.id) ?? null, input.applications.get(job.id) ?? null),
      warmPath: warmPathFor(job, input.contacts),
      score: match?.score ?? null,
      skills: match?.skills ?? [],
      postingUrl: safePostingUrl(job.url),
      applicationStatus: input.applications.get(job.id)?.status ?? null,
    };
  });

  const newMatchCount = input.jobs.filter((job) => input.matches.has(job.id) && !input.applications.has(job.id)).length;
  return {
    cards,
    totalOpen: input.jobs.length,
    totalFiltered: filtered.length,
    newMatchCount,
    hasMore: filtered.length > page.length,
    nextLimit: Math.min(FEED_MAX_LIMIT, input.limit + FEED_PAGE_SIZE),
  };
}

export interface EmptyFeedCopy {
  title: string;
  body: string;
}

export function emptyFeedCopy(filter: JobFilter): EmptyFeedCopy {
  switch (filter) {
    case "intern":
      return { title: "No internships right now", body: "Inroad checks public company job feeds every 6 hours. New internships show up here." };
    case "newgrad":
      return { title: "No new-grad roles right now", body: "Inroad checks public company job feeds every 6 hours. New-grad roles show up here." };
    case "warm":
      return {
        title: "No roles where you know someone yet",
        body: "Add the people you know on Warm paths, and roles at their companies show up here.",
      };
    default:
      return { title: "No open roles yet", body: "Inroad checks public company job feeds every 6 hours. New roles show up here." };
  }
}
