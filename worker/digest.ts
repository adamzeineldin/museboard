import type { DigestRunSummary } from "@/lib/digest/send";
import type { Logger } from "./pass";

// The weekly digest job (registered with DIGEST_CRON in worker/schedule.ts, or run once by
// worker/digest-once.ts). Never throws: it logs and reports success so the schedule keeps running.

export interface DigestJobDeps {
  send: (now: Date) => Promise<DigestRunSummary>;
  logger: Logger;
  now?: () => Date;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function formatDigestSummary(startedAt: Date, durationMs: number, summary: DigestRunSummary): string {
  return (
    `[worker] digest ${startedAt.toISOString()} done in ${(durationMs / 1000).toFixed(1)}s: ` +
    `${summary.sent} sent, ${summary.skipped} skipped, ${summary.failed} failed of ${summary.users} users`
  );
}

/** True when the run finished and every user's digest was sent or deliberately skipped. */
export async function runDigestJob(deps: DigestJobDeps): Promise<boolean> {
  const clock = deps.now ?? (() => new Date());
  const startedAt = clock();
  try {
    const summary = await deps.send(startedAt);
    const line = formatDigestSummary(startedAt, clock().getTime() - startedAt.getTime(), summary);
    if (summary.failed > 0) deps.logger.warn(line);
    else deps.logger.info(line);
    return summary.failed === 0;
  } catch (error) {
    deps.logger.error(`[worker] digest run failed at ${startedAt.toISOString()}: ${errorMessage(error)}`);
    return false;
  }
}
