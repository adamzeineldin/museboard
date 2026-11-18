"use client";

import { useActionState } from "react";
import { requestMagicLink, type SignInState } from "./actions";

export interface SignInFormProps {
  callbackUrl: string;
  initialError: string | null;
}

/** The email half of the sign-in card. The same link signs in an existing account or creates a new one. */
export function SignInForm({ callbackUrl, initialError }: SignInFormProps) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestMagicLink, { error: initialError, email: "" });
  return (
    <form action={action} noValidate className="signin-form">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="signin-field">
        <span>Email address</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder="Enter your email address"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "signin-error" : undefined}
        />
      </label>
      {state.error ? (
        <p id="signin-error" className="banner hold" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="signin-primary" disabled={pending} aria-label="Continue with email">
        {pending ? "Sending link…" : "Continue"}
        {pending ? null : (
          <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
            <path d="M2 1l6 4-6 4z" fill="currentColor" />
          </svg>
        )}
      </button>
    </form>
  );
}
