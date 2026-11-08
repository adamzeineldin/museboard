import "server-only";
import { getReleaseVerdicts, weekCount, type ReleaseVerdict } from "@/lib/applications";
import { loadRuleCampaign } from "@/lib/campaign";
import { db } from "@/lib/db";
import { parseMatchReasons } from "@/lib/matching/score";
import { contactsByCompany } from "@/lib/outreach";
import { getDefaultResume } from "@/lib/resume";
import { buildJobCards, type FeedContact, type FeedResult, type JobFilter } from "./job-view-model";
import type { RuleInputs } from "./rule-batch";

// Loads everything the Jobs feed needs in a fixed number of queries (no per-job lookups), then hands
// it to the pure view model. Campaign state and weekCount are loaded once per request.

export interface FeedUser {
  id: string;
  timezone: string;
}

export interface FeedOptions {
  filter: JobFilter;
  limit: number;
  now?: Date;
}

export interface JobsFeedData extends FeedResult {
  resume: { id: string; filename: string } | null;
  rulesAvailable: boolean;
  contactsAvailable: boolean;
}

const errorDetail = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function loadRuleInputs(user: FeedUser, now: Date): Promise<RuleInputs> {
  try {
    const [context, count] = await Promise.all([
      loadRuleCampaign(user.id, user.timezone),
      weekCount(user.id, now, user.timezone),
    ]);
    return { available: true, campaign: context.ruleCampaign, weekCount: count };
  } catch (error) {
    console.error("[jobs] loading campaign rules failed", { userId: user.id, error: errorDetail(error) });
    return { available: false };
  }
}

async function loadVerdicts(userId: string, now: Date): Promise<Map<string, ReleaseVerdict>> {
  try {
    return await getReleaseVerdicts(userId, now);
  } catch (error) {
    // Prepared cards then read "Held: Release check unavailable"; nothing claims to be ready.
    console.error("[jobs] loading release verdicts failed", { userId, error: errorDetail(error) });
    return new Map();
  }
}

async function loadContacts(userId: string): Promise<Map<string, FeedContact[]> | null> {
  try {
    const grouped = await contactsByCompany(userId);
    return new Map([...grouped].map(([companyId, list]) => [companyId, list.map((c) => ({ id: c.id, name: c.name }))]));
  } catch (error) {
    console.error("[jobs] loading contacts failed", { userId, error: errorDetail(error) });
    return null;
  }
}

export async function loadJobsFeed(user: FeedUser, options: FeedOptions): Promise<JobsFeedData> {
  const now = options.now ?? new Date();
  const [resume, jobs, matches, applications, contacts, rules, verdicts] = await Promise.all([
    getDefaultResume(user.id),
    db.job.findMany({ where: { closedAt: null }, include: { company: { select: { name: true } } } }),
    db.match.findMany({ where: { userId: user.id, job: { closedAt: null } }, select: { jobId: true, score: true, reasons: true } }),
    db.application.findMany({ where: { userId: user.id }, select: { id: true, jobId: true, status: true, decidedBy: true } }),
    loadContacts(user.id),
    loadRuleInputs(user, now),
    loadVerdicts(user.id, now),
  ]);

  const result = buildJobCards({
    jobs: jobs.map((job) => ({
      id: job.id,
      title: job.title,
      location: job.location,
      type: job.type,
      postedAt: job.postedAt,
      firstSeenAt: job.firstSeenAt,
      source: job.source,
      compensation: job.compensation,
      url: job.url,
      companyId: job.companyId,
      companyName: job.company.name,
    })),
    matches: new Map(matches.map((m) => [m.jobId, { score: m.score, skills: parseMatchReasons(m.reasons).skills }])),
    applications: new Map(
      applications.map((a) => [a.jobId, { status: a.status, decidedBy: a.decidedBy, release: verdicts.get(a.id) ?? null }]),
    ),
    contacts: contacts ?? new Map(),
    rules,
    filter: options.filter,
    limit: options.limit,
    now,
  });

  return {
    ...result,
    resume: resume ? { id: resume.id, filename: resume.filename } : null,
    rulesAvailable: rules.available,
    contactsAvailable: contacts !== null,
  };
}
