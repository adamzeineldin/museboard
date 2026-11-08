import type { PrismaClient } from "@/generated/prisma/client";
import { ingestRun, type IngestResult } from "./ingest";
import type { ScraperResult } from "./runScraper";

// One worker pass: scrape -> ingest -> recompute matches for every user with a default resume, then delete expired
// sign-in links (always, even when the scrape or ingest fails).
// Job ingest is not per-user, so it writes no AuditEvent; it is logged instead.

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PassDeps {
  prisma: PrismaClient;
  scrape: () => Promise<ScraperResult>;
  recompute: (userId: string) => Promise<number>;
  /** Housekeeping after the scrape (deleteExpiredVerificationTokens); returns the number of rows deleted. */
  cleanup?: (now: Date) => Promise<number>;
  now?: () => Date;
  logger: Logger;
}

export interface MatchCounts {
  users: number;
  ok: number;
  failed: number;
}

export interface PassSummary {
  startedAt: Date;
  durationMs: number;
  exitCode: number;
  ingest: IngestResult;
  matches: MatchCounts;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function recomputeAll(deps: PassDeps): Promise<MatchCounts> {
  const users = await deps.prisma.user.findMany({
    where: { resumes: { some: { isDefault: true } } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  let ok = 0;
  for (const user of users) {
    try {
      await deps.recompute(user.id);
      ok += 1;
    } catch (error) {
      // One user's failure (or the milestone-4 stub throwing) must not fail the run.
      deps.logger.error(`[worker] recomputeMatches failed for user ${user.id}: ${errorMessage(error)}`);
    }
  }
  return { users: users.length, ok, failed: users.length - ok };
}

/** Never throws: a failed cleanup is logged and retried on the next pass. */
async function runCleanup(deps: PassDeps, now: Date): Promise<void> {
  if (!deps.cleanup) return;
  try {
    const deleted = await deps.cleanup(now);
    deps.logger.info(`[worker] deleted ${deleted} expired sign-in links`);
  } catch (error) {
    deps.logger.error(`[worker] sign-in link cleanup failed: ${errorMessage(error)}`);
  }
}

export async function runPass(deps: PassDeps): Promise<PassSummary> {
  const clock = deps.now ?? (() => new Date());
  const startedAt = clock();
  try {
    const scraped = await deps.scrape();
    if (scraped.exitCode === 1) deps.logger.warn("[worker] scraper reported that every company failed");

    const ingest = await ingestRun(deps.prisma, scraped.json, startedAt);
    for (const failure of ingest.failures) {
      deps.logger.warn(`[worker] skipped ${failure.company}: ${failure.error}`);
    }

    const matches = await recomputeAll(deps);
    return { startedAt, durationMs: clock().getTime() - startedAt.getTime(), exitCode: scraped.exitCode, ingest, matches };
  } finally {
    // Runs on every pass whatever the scrape result; runCleanup never throws, so it cannot mask the scrape error.
    await runCleanup(deps, startedAt);
  }
}

/** A pass where the scraper reported that every company failed (exit code 1) is a failure for scrape:once. */
export function passSucceeded(summary: PassSummary): boolean {
  return summary.exitCode === 0;
}

export function formatSummary(summary: PassSummary): string {
  const { ingest, matches } = summary;
  const okCompanies = ingest.companies - ingest.skippedCompanies;
  const failed = ingest.failures.length > 0 ? ` (failed: ${ingest.failures.map((f) => f.company).join(", ")})` : "";
  return (
    `[worker] run ${summary.startedAt.toISOString()} done in ${(summary.durationMs / 1000).toFixed(1)}s: ` +
    `companies ${okCompanies}/${ingest.companies} ok${failed}; ` +
    `jobs created ${ingest.created}, updated ${ingest.updated} (reopened ${ingest.reopened}), ` +
    `closed ${ingest.closed}, dropped ${ingest.droppedPostings}; ` +
    `matches ${matches.ok}/${matches.users} users ok, ${matches.failed} failed`
  );
}
