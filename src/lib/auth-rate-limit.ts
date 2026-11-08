import { createRateLimiter, type RateLimiter } from "@/mcp/http/rate-limit";

// Throttles magic-link emails so nobody can flood an inbox or burn the SMTP sender's reputation.
// Two layers:
//  - A per-client and per-email guard runs before Auth.js, so a limited request never creates a
//    VerificationToken: in the sign-in server action, and in the /api/auth POST wrapper for direct
//    POST /api/auth/signin/nodemailer requests (src/app/api/auth/[...nextauth]/magic-link-guard.ts).
//  - Auth.js sendVerificationRequest checks the per-email limit again as a last line of defence.
// There is deliberately no process-wide cap: a single shared bucket would let one sender lock everyone out.
// In memory, so it only limits within one process.
// TODO(scale): multi-instance deploys need a shared store (e.g. Redis or Postgres) so the limit holds everywhere.

export interface LimitWindow {
  capacity: number;
  windowMs: number;
}

export const MAGIC_LINK_LIMITS = {
  /** Links per address: enough for a typo or a slow inbox, not enough to bomb someone. */
  perEmail: { capacity: 3, windowMs: 10 * 60_000 },
  /** Requests per client IP: room for a shared campus network, not for spraying many addresses. */
  perClient: { capacity: 20, windowMs: 10 * 60_000 },
} as const satisfies Record<string, LimitWindow>;

export type MagicLinkLimit = "per-client" | "per-email";

const UNKNOWN_CLIENT = "unknown";
const MAX_CLIENT_KEY_LENGTH = 64;

const normaliseEmail = (email: string): string => email.trim().toLowerCase();

export interface MagicLinkLimiterOptions {
  perEmail?: LimitWindow;
  now?: () => number;
}

export interface MagicLinkLimiter {
  /** True when one more link may be sent to this address. Counts the attempt either way. */
  allow: (email: string) => boolean;
}

export function createMagicLinkLimiter(options: MagicLinkLimiterOptions = {}): MagicLinkLimiter {
  const perEmail: RateLimiter = createRateLimiter({ ...(options.perEmail ?? MAGIC_LINK_LIMITS.perEmail), now: options.now });
  return {
    allow: (email) => perEmail.take(normaliseEmail(email)).allowed,
  };
}

/**
 * The client's address from the first hop of x-forwarded-for, or "unknown" when there is none.
 * Only trustworthy behind a proxy that overwrites the header; without one a client can choose its own key,
 * which still leaves the per-email limit in force.
 */
export function clientIpFrom(headers: Pick<Headers, "get">): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return first ? first.slice(0, MAX_CLIENT_KEY_LENGTH) : UNKNOWN_CLIENT;
}

export interface MagicLinkRequestGuardOptions extends MagicLinkLimiterOptions {
  perClient?: LimitWindow;
}

export interface MagicLinkRequestGuard {
  /** The limit this request hits, or null when it may go ahead. Counts the attempt against each limit it reaches. */
  check: (email: string, clientIp: string) => MagicLinkLimit | null;
}

export function createMagicLinkRequestGuard(options: MagicLinkRequestGuardOptions = {}): MagicLinkRequestGuard {
  const perClient: RateLimiter = createRateLimiter({ ...(options.perClient ?? MAGIC_LINK_LIMITS.perClient), now: options.now });
  // Separate from the sendVerificationRequest limiter, so a request through the form counts once in each.
  const perEmail = createMagicLinkLimiter(options);
  return {
    check(email, clientIp) {
      if (!perClient.take(clientIp).allowed) return "per-client";
      return perEmail.allow(email) ? null : "per-email";
    },
  };
}

export const magicLinkRequestGuard: MagicLinkRequestGuard = createMagicLinkRequestGuard();

/** Logs a refused magic-link request. The address is left out on purpose: it is personal data and the attacker controls it. */
export function warnMagicLinkLimited(limit: MagicLinkLimit): void {
  console.warn(`[auth] magic link not sent: ${limit} limit reached`);
}

export const magicLinkLimiter: MagicLinkLimiter = createMagicLinkLimiter();

/**
 * Runs `send` unless the address is over its limit. When limited it returns quietly, so the visitor still
 * lands on "Check your email" and the response never reveals whether a link went out.
 */
export async function sendMagicLinkWithinLimit(
  identifier: string,
  send: () => Promise<void>,
  limiter: MagicLinkLimiter = magicLinkLimiter,
): Promise<void> {
  if (!limiter.allow(identifier)) {
    warnMagicLinkLimited("per-email");
    return;
  }
  await send();
}
