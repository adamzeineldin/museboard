"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { requestMagicLink, type SignInState } from "./actions";

export interface SignInFormProps {
  callbackUrl: string;
  initialError: string | null;
}

export function SignInForm({ callbackUrl, initialError }: SignInFormProps) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestMagicLink, { error: initialError, email: "" });
  return (
    <form action={action} noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="field">
        <span className="label">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          placeholder="you@school.edu"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "signin-error" : undefined}
        />
      </label>
      {state.error ? (
        <p id="signin-error" className="banner hold" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
