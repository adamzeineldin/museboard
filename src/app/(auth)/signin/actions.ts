"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { clientIpFrom, magicLinkRequestGuard, warnMagicLinkLimited } from "@/lib/auth-rate-limit";
import { safeCallbackPath } from "@/lib/protected-routes";

export interface SignInState {
  error: string | null;
  email: string;
}

// The URL Auth.js redirects to after sending a link (it then forwards to /signin/check-email), so a limited
// request takes the same hops as a sent one and the response never reveals whether a link went out.
const VERIFY_REQUEST_PATH = "/api/auth/verify-request?provider=nodemailer&type=email";

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  callbackUrl: z.string().optional(),
});

/** Sends a magic link. On success Auth.js redirects via /api/auth/verify-request to /signin/check-email. */
export async function requestMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const raw = { email: String(formData.get("email") ?? ""), callbackUrl: formData.get("callbackUrl")?.toString() };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Enter a valid email address.", email: raw.email };
  }
  // Checked before signIn() so a limited request creates no VerificationToken and sends no email.
  const limited = magicLinkRequestGuard.check(parsed.data.email, clientIpFrom(await headers()));
  if (limited) {
    warnMagicLinkLimited(limited);
    redirect(VERIFY_REQUEST_PATH);
  }
  try {
    await signIn("nodemailer", { email: parsed.data.email, redirectTo: safeCallbackPath(parsed.data.callbackUrl) });
    return { error: null, email: parsed.data.email };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[auth] magic link request failed", error instanceof Error ? error.message : error);
    if (error instanceof AuthError) {
      return { error: "We couldn't send your sign-in link. Try again in a minute.", email: parsed.data.email };
    }
    return { error: "Something went wrong. Try again.", email: parsed.data.email };
  }
}
