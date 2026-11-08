import "dotenv/config";
import { db } from "@/lib/db";
import { recomputeMatches } from "@/lib/matching";
import { parseWorkerArgs } from "./args";
import { formatSummary, runPass, type Logger } from "./pass";
import { runScraper } from "./runScraper";
import { exclusive, registerSchedules, SCRAPE_CRON, type StoppableTask } from "./schedule";

// Entry point. Run through tsx with the react-server condition so `server-only` imports resolve:
//   npm run worker        -> one pass now (unless --no-initial), then every 6 hours
//   npm run scrape:once   -> one pass, exit 0 on success / 1 on failure

const logger: Logger = {
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One pass. Never throws: returns false and logs on failure so the schedule keeps running. */
async function scrapeAndIngest(): Promise<boolean> {
  try {
    const summary = await runPass({ prisma: db, scrape: () => runScraper(), recompute: recomputeMatches, logger });
    logger.info(formatSummary(summary));
    return true;
  } catch (error) {
    logger.error(`[worker] run failed at ${new Date().toISOString()}: ${errorMessage(error)}`);
    return false;
  }
}

async function shutdown(tasks: readonly StoppableTask[], code: number): Promise<never> {
  await Promise.allSettled(tasks.map((task) => task.stop()));
  await db.$disconnect().catch((error: unknown) => logger.error(`[worker] disconnect failed: ${errorMessage(error)}`));
  process.exit(code);
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseWorkerArgs(argv);

  if (args.mode === "once") {
    const ok = await scrapeAndIngest();
    await shutdown([], ok ? 0 : 1);
  }

  const scrape = exclusive(
    async () => {
      await scrapeAndIngest();
    },
    () => logger.warn("[worker] previous run still in progress; skipping this one"),
  );
  // MILESTONE 8 HOOK: pass `digest` here to schedule the weekly digest (see worker/schedule.ts).
  const tasks = registerSchedules({ scrape });
  logger.info(`[worker] scheduled scrape "${SCRAPE_CRON}" (UTC)${args.initialRun ? "; running once now" : ""}`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      logger.info(`[worker] ${signal} received, stopping`);
      void shutdown(tasks, 0);
    });
  }

  if (args.initialRun) await scrape();
}

main(process.argv.slice(2)).catch(async (error: unknown) => {
  logger.error(`[worker] fatal: ${errorMessage(error)}`);
  await db.$disconnect().catch(() => undefined);
  process.exit(2);
});
