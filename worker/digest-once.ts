import "dotenv/config";
import { db } from "@/lib/db";
import { sendWeeklyDigests } from "@/lib/digest";
import { runDigestJob } from "./digest";
import { devFallbackWarnings } from "./env-warnings";
import type { Logger } from "./pass";

// Manual run of the weekly digest (the scheduled one lives in worker/index.ts):
//   npm run digest:once        (tsx --conditions=react-server worker/digest-once.ts)
//   npm run digest:once:prod   (same with NODE_ENV=production, so no .dev-mail/ or localhost fallbacks)
// Reports the ISO week that ended most recently in each user's time zone. A week already sent is skipped,
// so re-running is safe. Exit code 0 when every digest was sent or skipped, 1 otherwise.

const logger: Logger = {
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

async function main(): Promise<number> {
  for (const warning of devFallbackWarnings()) logger.warn(warning);
  const ok = await runDigestJob({ send: (now) => sendWeeklyDigests(now), logger });
  return ok ? 0 : 1;
}

main()
  .catch((error: unknown) => {
    logger.error(`[worker] digest fatal: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  })
  .then(async (code) => {
    await db.$disconnect().catch(() => undefined);
    process.exit(code);
  });
