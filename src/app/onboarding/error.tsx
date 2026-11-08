"use client";

import { useEffect } from "react";

export default function OnboardingError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[onboarding] page error", error instanceof Error ? error.name : "non-error");
  }, [error]);
  return (
    <main className="auth">
      <div className="auth-card" role="alert">
        <h1>Welcome to Inroad</h1>
        <p className="muted">This page didn&apos;t load. Nothing was saved. Try again in a moment.</p>
        <button type="button" className="btn primary" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </main>
  );
}
