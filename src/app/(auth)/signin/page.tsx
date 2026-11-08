import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/shell/BrandMark";
import { auth } from "@/lib/auth";
import { safeCallbackPath } from "@/lib/protected-routes";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ERROR_COPY: Record<string, string> = {
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  Configuration: "Sign-in isn't configured correctly on the server.",
  AccessDenied: "You don't have access to sign in.",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const callbackUrl = safeCallbackPath(first(params.callbackUrl));
  const session = await auth();
  if (session?.user?.id) redirect(callbackUrl);

  const errorCode = first(params.error);
  const initialError = errorCode ? (ERROR_COPY[errorCode] ?? "Sign-in failed. Try again.") : null;

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          <b>Inroad</b>
        </div>
        <div>
          <h1>Sign in</h1>
          <p className="muted">We&apos;ll email you a link. No password needed.</p>
        </div>
        <SignInForm callbackUrl={callbackUrl} initialError={initialError} />
        <p className="muted" style={{ fontSize: ".82rem" }}>
          Inroad only applies inside a campaign you approve, and never sends outreach for you.
        </p>
      </div>
    </main>
  );
}
