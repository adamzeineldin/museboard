import type { PrismaClient } from "@/generated/prisma/client";
import { ingestRun, type IngestResult } from "./ingest";
import type { ScraperResult } from "./runScraper";

// One worker pass: scrape -> ingest -> recompute matches for every user with a default resume.
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

export async function runPass(deps: PassDeps): Promise<PassSummary> {
  const clock = deps.now ?? (() => new Date());
  const startedAt = clock();
  const scraped = await deps.scrape();
  if (scraped.exitCode === 1) deps.logger.warn("[worker] scraper reported that every company failed");

  const ingest = await ingestRun(deps.prisma, scraped.json, startedAt);
  for (const failure of ingest.failures) {
    deps.logger.warn(`[worker] skipped ${failure.company}: ${failure.error}`);
  }

  const matches = await recomputeAll(deps);
  return { startedAt, durationMs: clock().getTime() - startedAt.getTime(), exitCode: scraped.exitCode, ingest, matches };
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
