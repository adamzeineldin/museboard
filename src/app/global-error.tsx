"use client";

import { useEffect } from "react";
import "./globals.css";

// Replaces the root layout when it fails, so it brings its own <html>/<body> and the global styles.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const digest = error instanceof Error ? ((error as Error & { digest?: string }).digest ?? error.name) : "non-error";
    console.error("[root] global error", digest);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Inroad</title>
        <main className="auth">
          <div className="auth-card" role="alert">
            <h1>Inroad didn&apos;t load</h1>
            <p className="muted">Something went wrong on our side. Your campaign and applications are unchanged.</p>
            <button type="button" className="btn primary" onClick={() => retry()}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
