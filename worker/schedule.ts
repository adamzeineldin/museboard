import cron, { type TaskOptions } from "node-cron";

// Every cron registration the worker makes lives here, so later milestones add jobs in one place.

/** Scrape every 6 hours, on the hour (UTC). Brief sec. 4: "A worker runs the scraper every 6 hours". */
export const SCRAPE_CRON = "0 */6 * * *";

/**
 * MILESTONE 8 HOOK (weekly digest): Monday 13:00 UTC. The digest job decides per user (timezone,
 * digestOptOut) what to send; replace this pattern if milestone 8 needs a different cadence.
 */
export const DIGEST_CRON = "0 13 * * 1";

export const SCHEDULE_TIMEZONE = "UTC";

export interface WorkerJobs {
  scrape: () => Promise<void>;
  /** MILESTONE 8 HOOK: pass the weekly digest job here (src/lib/digest) to schedule it. */
  digest?: () => Promise<void>;
}

export interface StoppableTask {
  stop(): void | Promise<void>;
}

/** The part of node-cron used here; tests pass a fake. */
export interface Scheduler {
  schedule(expression: string, fn: () => Promise<void>, options: TaskOptions): StoppableTask;
}

export function registerSchedules(jobs: WorkerJobs, scheduler: Scheduler = cron): StoppableTask[] {
  const base = { timezone: SCHEDULE_TIMEZONE, noOverlap: true } as const;
  const tasks = [scheduler.schedule(SCRAPE_CRON, jobs.scrape, { ...base, name: "scrape" })];

  // ---- MILESTONE 8 HOOK: weekly digest is registered here once worker/index.ts passes `digest`. ----
  if (jobs.digest) {
    tasks.push(scheduler.schedule(DIGEST_CRON, jobs.digest, { ...base, name: "weekly-digest" }));
  }
  return tasks;
}

/**
 * Wrap a job so a call made while the previous one is still running is skipped (e.g. the startup run
 * still going when the first cron tick fires). node-cron's noOverlap only covers its own ticks.
 */
export function exclusive(job: () => Promise<void>, onSkip: () => void): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      onSkip();
      return;
    }
    running = true;
    try {
      await job();
    } finally {
      running = false;
    }
  };
}
