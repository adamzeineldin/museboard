import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { OAUTH_LABEL, isOAuthProvider } from "@/lib/auth-providers";
import { PRODUCT_NAME } from "@/lib/brand";
import { safeCallbackPath } from "@/lib/protected-routes";
import { ProviderButtons } from "./ProviderButtons";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ERROR_COPY: Record<string, string> = {
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  Configuration: "Sign-in isn't configured correctly on the server.",
  AccessDenied: "You don't have access to sign in.",
  OAuthAccountNotLinked: "That email already has an account. Sign in the way you first did, then try again.",
  OAuthCallbackError: "That sign-in was cancelled or didn't finish. Try again.",
  OAuthSignin: "We couldn't reach that sign-in provider. Try again.",
};

function errorCopy(code: string, provider: string | undefined): string {
  if (code === "ProviderNotConfigured") {
    const name = isOAuthProvider(provider) ? OAUTH_LABEL[provider] : "That provider";
    return `${name} sign-in isn't set up on this server yet. Use your email instead.`;
  }
  return ERROR_COPY[code] ?? "Sign-in failed. Try again.";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const callbackUrl = safeCallbackPath(first(params.callbackUrl));
  const session = await auth();
  if (session?.user?.id) redirect(callbackUrl);

  const errorCode = first(params.error);
  const initialError = errorCode ? errorCopy(errorCode, first(params.provider)) : null;
  const signup = first(params.mode) === "signup";
  const otherMode = new URLSearchParams({ ...(signup ? {} : { mode: "signup" }), callbackUrl });

  return (
    <main className="signin">
      <div className="signin-brand">{PRODUCT_NAME}</div>
      <div className="signin-card">
        <h1>{signup ? `Create your ${PRODUCT_NAME} account` : `Sign in to ${PRODUCT_NAME}`}</h1>
        <ProviderButtons callbackUrl={callbackUrl} />
        <div className="signin-or" role="separator">
          <span>or</span>
        </div>
        <SignInForm callbackUrl={callbackUrl} initialError={initialError} />
        <p className="signin-note">We&apos;ll email you a link. No password needed.</p>
      </div>
      <p className="signin-switch">
        {signup ? "Already have an account? " : `New to ${PRODUCT_NAME}? `}
        <Link href={`/signin?${otherMode.toString()}`}>{signup ? "Sign in" : "Create an account"}</Link>
      </p>
    </main>
  );
}
