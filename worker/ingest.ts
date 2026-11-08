import type { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeCompanyName } from "@/lib/company-name";
import { scraperRunSchema, type CompanyResult, type ScrapedJob } from "./runSchema";

// Writes one scraper run into the DB. Rules (from the scraper contract):
//  1. Only companies with ok=true are written. ok=false companies (and companies absent from the run) are untouched.
//  2. Postings with type=null are dropped.
//  3. Jobs upsert by their stable id; firstSeenAt is set only on create; a job that reappears is reopened.
//  4. Open jobs of an ok company that are missing from this run get closedAt=now (scoped to that company).

const MAX_REPORTED_ISSUES = 5;
const COMPANY_TX_TIMEOUT_MS = 60_000;
const UNKNOWN_LOCATION = ""; // Job.location is required; the scraper sends null when the board lists none.

export class InvalidRunError extends Error {
  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    super(`invalid scraper run JSON: ${formatIssues(issues)}`);
    this.name = "InvalidRunError";
  }
}

export interface CompanyFailure {
  company: string;
  error: string;
}

export interface IngestResult {
  created: number;
  updated: number;
  /** Subset of `updated`: jobs that were closed and came back. */
  reopened: number;
  closed: number;
  skippedCompanies: number;
  droppedPostings: number;
  companies: number;
  failures: CompanyFailure[];
}

interface CompanyCounts {
  created: number;
  updated: number;
  reopened: number;
  closed: number;
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  const shown = issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`);
  const more = issues.length > MAX_REPORTED_ISSUES ? ` (+${issues.length - MAX_REPORTED_ISSUES} more)` : "";
  return shown.join("; ") + more;
}

/** Keep typed postings only, first occurrence of each id wins. */
function keptJobs(jobs: readonly ScrapedJob[]): ScrapedJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (job.type === null || seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function jobFields(job: ScrapedJob) {
  return {
    title: job.title,
    location: job.location ?? UNKNOWN_LOCATION,
    // keptJobs() removed null types; the fallback only satisfies the type checker.
    type: job.type ?? "intern",
    postedAt: job.posted_at === null ? null : new Date(job.posted_at),
    url: job.url,
    source: job.source,
    description: job.description_text === "" ? null : job.description_text,
    compensation: job.compensation,
    department: job.department,
  };
}

/**
 * The company row for a scraped name: an exact match, else a case-insensitive one (a user may have created
 * "stripe" from a contact or CSV before the first scrape), else a new row. Existing rows keep their
 * ats/atsConfig (owned by seed/admin config). The Company table is small, so matching runs in memory.
 */
async function companyFor(tx: Prisma.TransactionClient, result: CompanyResult): Promise<{ id: string }> {
  const exact = await tx.company.findUnique({ where: { name: result.company }, select: { id: true } });
  if (exact) return exact;
  const key = normalizeCompanyName(result.company);
  const all = await tx.company.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  const match = all.find((row) => normalizeCompanyName(row.name) === key);
  if (match) return { id: match.id };
  return tx.company.create({ data: { name: result.company, ats: result.ats }, select: { id: true } });
}

async function ingestCompany(tx: Prisma.TransactionClient, result: CompanyResult, now: Date): Promise<CompanyCounts> {
  const company = await companyFor(tx, result);
  const jobs = keptJobs(result.jobs);
  const ids = jobs.map((job) => job.id);
  const existing = await tx.job.findMany({ where: { id: { in: ids } }, select: { id: true, closedAt: true } });
  const existingById = new Map(existing.map((row) => [row.id, row]));

  for (const job of jobs) {
    const fields = jobFields(job);
    await tx.job.upsert({
      where: { id: job.id },
      create: { id: job.id, companyId: company.id, firstSeenAt: now, ...fields },
      update: { ...fields, closedAt: null },
    });
  }

  const closed = await tx.job.updateMany({
    where: { companyId: company.id, closedAt: null, id: { notIn: ids } },
    data: { closedAt: now },
  });

  return {
    created: jobs.length - existingById.size,
    updated: existingById.size,
    reopened: existing.filter((row) => row.closedAt !== null).length,
    closed: closed.count,
  };
}

/**
 * Validate a scraper run (unknown JSON) and apply it. Each company is written in its own transaction,
 * so a DB error mid-run leaves earlier companies applied and the failing one unchanged; the error is rethrown.
 */
export async function ingestRun(prisma: PrismaClient, runJson: unknown, now: Date): Promise<IngestResult> {
  const parsed = scraperRunSchema.safeParse(runJson);
  if (!parsed.success) throw new InvalidRunError(parsed.error.issues);

  const okResults = parsed.data.companies.filter((result) => result.ok);
  const failures = parsed.data.companies
    .filter((result) => !result.ok)
    .map((result) => ({ company: result.company, error: result.error ?? "unknown error" }));

  let totals: CompanyCounts = { created: 0, updated: 0, reopened: 0, closed: 0 };
  for (const result of okResults) {
    const counts = await prisma.$transaction((tx) => ingestCompany(tx, result, now), { timeout: COMPANY_TX_TIMEOUT_MS });
    totals = {
      created: totals.created + counts.created,
      updated: totals.updated + counts.updated,
      reopened: totals.reopened + counts.reopened,
      closed: totals.closed + counts.closed,
    };
  }

  const postings = okResults.reduce((sum, result) => sum + result.jobs.length, 0);
  const kept = okResults.reduce((sum, result) => sum + keptJobs(result.jobs).length, 0);
  return {
    ...totals,
    skippedCompanies: failures.length,
    droppedPostings: postings - kept,
    companies: parsed.data.companies.length,
    failures,
  };
}
