"use server";

import { AuthError } from "next-auth";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/protected-routes";

export interface SignInState {
  error: string | null;
  email: string;
}

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  callbackUrl: z.string().optional(),
});

/** Sends a magic link. On success Auth.js redirects to /signin/check-email. */
export async function requestMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const raw = { email: String(formData.get("email") ?? ""), callbackUrl: formData.get("callbackUrl")?.toString() };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Enter a valid email address.", email: raw.email };
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
