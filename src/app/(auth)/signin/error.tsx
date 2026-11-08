"use client";

import { useEffect } from "react";

export default function SignInError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[signin] page error", error instanceof Error ? error.name : "non-error");
  }, [error]);
  return (
    <main className="auth">
      <div className="auth-card" role="alert">
        <h1>Sign in</h1>
        <p className="muted">Sign-in didn&apos;t load. Try again in a moment.</p>
        <button type="button" className="btn primary" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </main>
  );
}
