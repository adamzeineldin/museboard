import { z } from "zod";

// Environment for the weekly digest: the signing secret for one-click links, the public base URL the
// links point at, and the mail settings (shared with the Auth.js magic-link mailer in src/lib/auth-mail.ts).

export const DEFAULT_DIGEST_FROM = "Inroad <no-reply@inroad.local>";
const DEV_BASE_URL = "http://localhost:3000";
/** Auth.js secrets are 32+ random bytes; refuse anything short enough to guess. */
export const MIN_SECRET_LENGTH = 16;

/** Thrown when the digest can't run because the server is misconfigured. The message names the setting, never its value. */
export class DigestConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DigestConfigError";
  }
}

export interface DigestLinkConfig {
  secret: string;
  /** Origin plus optional path prefix, without a trailing slash. */
  baseUrl: string;
}

export interface DigestMailConfig {
  from: string;
  /** SMTP connection URL. Undefined means "use the dev-mail directory". */
  emailServer?: string;
}

const httpUrl = z.url({ protocol: /^https?$/ });

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function linkSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = nonEmpty(env.AUTH_SECRET);
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new DigestConfigError(`AUTH_SECRET must be set (at least ${MIN_SECRET_LENGTH} characters) to sign digest links.`);
  }
  return secret;
}

export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = nonEmpty(env.APP_URL) ?? nonEmpty(env.AUTH_URL);
  if (!configured) {
    if (env.NODE_ENV === "production") throw new DigestConfigError("APP_URL must be set so digest links point at the app.");
    return DEV_BASE_URL;
  }
  const parsed = httpUrl.safeParse(configured);
  if (!parsed.success) throw new DigestConfigError("APP_URL must be an http(s) URL.");
  return parsed.data.replace(/\/+$/, "");
}

export function digestLinkConfig(env: NodeJS.ProcessEnv = process.env): DigestLinkConfig {
  return { secret: linkSecret(env), baseUrl: appBaseUrl(env) };
}

export function digestMailConfig(env: NodeJS.ProcessEnv = process.env): DigestMailConfig {
  return { from: nonEmpty(env.EMAIL_FROM) ?? DEFAULT_DIGEST_FROM, emailServer: nonEmpty(env.EMAIL_SERVER) };
}
