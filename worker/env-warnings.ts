// Startup warnings for the worker. Outside NODE_ENV=production the digest silently uses dev fallbacks: mail is
// written to .dev-mail/ (and audited as sent) and links point at localhost. Under `next start` NODE_ENV is set
// for you; the worker runs through tsx, so an operator has to set it (npm run worker:prod).

const PRODUCTION_HINT = "Run the worker with NODE_ENV=production (npm run worker:prod) in production.";

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

/** Warnings about dev fallbacks the weekly digest would use with this environment. Empty in production. */
export function devFallbackWarnings(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  if (env.NODE_ENV === "production") return [];
  const warnings: string[] = [];
  if (!isSet(env.EMAIL_SERVER)) {
    warnings.push(
      `[worker] EMAIL_SERVER is not set: weekly digests will be written to .dev-mail/ and recorded as sent, not emailed. ${PRODUCTION_HINT}`,
    );
  }
  if (!isSet(env.APP_URL) && !isSet(env.AUTH_URL)) {
    warnings.push(`[worker] APP_URL and AUTH_URL are not set: digest links will point at http://localhost:3000. ${PRODUCTION_HINT}`);
  }
  return warnings;
}
