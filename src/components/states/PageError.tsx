"use client";

import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

export interface PageErrorProps {
  /** The page heading, so the page keeps one h1 while it shows the error. */
  heading: string;
  /** Short log scope, e.g. "jobs". Never shown to the user. */
  scope: string;
  error: unknown;
  retry: () => void;
  message?: string;
}

const DEFAULT_MESSAGE = "Something went wrong on our side. Your campaign and applications are unchanged.";

/** Route-level error UI: the page heading, a user-safe message and a retry button. Logs only the digest. */
export function PageError({ heading, scope, error, retry, message = DEFAULT_MESSAGE }: PageErrorProps) {
  useEffect(() => {
    const digest = error instanceof Error ? ((error as Error & { digest?: string }).digest ?? error.name) : "non-error";
    console.error(`[${scope}] page error`, digest);
  }, [error, scope]);

  return (
    <>
      <div className="head">
        <h1>{heading}</h1>
      </div>
      <ErrorState
        title="This page didn't load"
        message={message}
        action={
          <Button variant="primary" size="small" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </>
  );
}
