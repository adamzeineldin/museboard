import { z } from "zod";
import {
  clientIpFrom,
  magicLinkRequestGuard,
  warnMagicLinkLimited,
  type MagicLinkRequestGuard,
} from "@/lib/auth-rate-limit";

// Direct POST /api/auth/signin/nodemailer requests skip the sign-in server action, so this wrapper runs the
// same per-client and per-email guard in front of Auth.js. A limited request gets the reply a real send gets
// (the verify-request redirect) and Auth.js never runs, so no VerificationToken is created.

const SIGNIN_PATH = /\/signin\/nodemailer\/?$/;
const VERIFY_REQUEST_QUERY = new URLSearchParams({ provider: "nodemailer", type: "email" }).toString();
// Longest valid address is 254 characters; anything past this is not worth counting separately.
const MAX_EMAIL_LENGTH = 320;

const emailBodySchema = z.object({ email: z.string().min(1).max(MAX_EMAIL_LENGTH) });

/**
 * The address Auth.js's defaultNormalizer (@auth/core send-token) sends to, so variants of one inbox
 * ("ＶＩＣＴＩＭ@x.edu", "victim@x.edu,junk") share one per-email bucket. Null when Auth.js would reject it
 * (quotes, not exactly one "@", empty part): Auth.js then answers with its own error and sends nothing.
 */
export function authjsEmailKey(raw: string): string | null {
  const email = raw.normalize("NFKC").toLowerCase().trim();
  if (email.includes('"')) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, rawDomain] = parts;
  const domain = rawDomain.split(",")[0];
  return local && domain ? `${local}@${domain}` : null;
}

type Handler<R extends Request> = (req: R) => Promise<Response>;

/** The email Auth.js will read from the body (JSON or form encoded), or null when there is none to guard. */
async function emailFrom(req: Request): Promise<string | null> {
  const contentType = req.headers.get("content-type") ?? "";
  try {
    const clone = req.clone();
    const body: unknown = contentType.includes("application/json")
      ? await clone.json()
      : contentType.includes("application/x-www-form-urlencoded")
        ? Object.fromEntries(new URLSearchParams(await clone.text()))
        : null;
    const parsed = emailBodySchema.safeParse(body);
    return parsed.success ? authjsEmailKey(parsed.data.email) : null;
  } catch {
    // An unreadable body carries no email; Auth.js rejects it without sending anything.
    return null;
  }
}

/** Where Auth.js redirects after a real send: same origin rules (AUTH_URL wins) and base path. */
function verifyRequestUrl(req: Request): string {
  const url = new URL(req.url);
  const envUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  const origin = envUrl ? new URL(envUrl).origin : url.origin;
  const basePath = url.pathname.replace(SIGNIN_PATH, "");
  return `${origin}${basePath}/verify-request?${VERIFY_REQUEST_QUERY}`;
}

/** The response Auth.js gives a successful send: JSON when the caller asked for the redirect back, else a 302. */
function sentResponse(req: Request): Response {
  const url = verifyRequestUrl(req);
  if (req.headers.has("X-Auth-Return-Redirect")) return Response.json({ url });
  return new Response(null, { status: 302, headers: { Location: url } });
}

export function withMagicLinkGuard<R extends Request>(
  handler: Handler<R>,
  guard: MagicLinkRequestGuard = magicLinkRequestGuard,
): Handler<R> {
  return async (req) => {
    if (!SIGNIN_PATH.test(new URL(req.url).pathname)) return handler(req);
    const email = await emailFrom(req);
    if (!email) return handler(req);
    const limited = guard.check(email, clientIpFrom(req.headers));
    if (!limited) return handler(req);
    warnMagicLinkLimited(limited);
    return sentResponse(req);
  };
}
