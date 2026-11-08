import "server-only";
import { evaluateJobs } from "@/components/jobs/rule-batch";
import { weekCount } from "@/lib/applications";
import { loadRuleCampaign } from "@/lib/campaign";
import { db } from "@/lib/db";
import { contactsByCompany } from "@/lib/outreach";
import type { JobType } from "@/lib/types";
import { ToolRefusal } from "../errors";
import { buildRoleRows, NEW_ROLE_DAYS, type RoleRow } from "./role-rows";
import { findCompanies } from "./companies";

// Loads find_roles in a fixed number of queries. The rule check is the same one the Jobs feed runs:
// loadRuleCampaign + weekCount once, then checkApplication per job (src/components/jobs/rule-batch.ts),
// which matches evaluateJobForUser job for job.

export interface RoleFilters {
  type?: JobType;
  company?: string;
  newOnly?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function companyFilter(company: string | undefined): Promise<string[] | null> {
  if (!company) return null;
  return (await findCompanies(company)).map((c) => c.id);
}

export async function findRoles(userId: string, filters: RoleFilters, now: Date): Promise<RoleRow[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new ToolRefusal("We couldn't find your account.");
  const companyIds = await companyFilter(filters.company);
  if (companyIds && companyIds.length === 0) return [];

  const jobs = await db.job.findMany({
    where: {
      closedAt: null,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.newOnly ? { firstSeenAt: { gte: new Date(now.getTime() - NEW_ROLE_DAYS * DAY_MS) } } : {}),
      ...(companyIds ? { companyId: { in: companyIds } } : {}),
    },
    include: { company: { select: { name: true } } },
  });
  const jobIds = jobs.map((job) => job.id);
  const [matches, applications, contacts, rule, count] = await Promise.all([
    db.match.findMany({ where: { userId, jobId: { in: jobIds } }, select: { jobId: true, score: true } }),
    db.application.findMany({ where: { userId, jobId: { in: jobIds } }, select: { id: true, jobId: true, status: true, reason: true } }),
    contactsByCompany(userId),
    loadRuleCampaign(userId, user.timezone),
    weekCount(userId, now, user.timezone),
  ]);

  const scores = new Map(matches.map((m) => [m.jobId, m.score]));
  const batch = jobs.map((job) => ({ id: job.id, companyName: job.company.name, type: job.type }));
  return buildRoleRows({
    jobs: jobs.map((job) => ({ ...job, companyName: job.company.name })),
    scores,
    applications: new Map(applications.map((a) => [a.jobId, a])),
    ruleResults: evaluateJobs(batch, scores, { available: true, campaign: rule.ruleCampaign, weekCount: count }, now),
    contactCounts: new Map([...contacts].map(([companyId, list]) => [companyId, list.length])),
  });
}
