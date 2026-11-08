"use client";

import { useEffect } from "react";
import { Button, ErrorState } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] page error", error.digest ?? error.message);
  }, [error]);

  return (
    <ErrorState
      title="This page didn't load"
      message="Something went wrong on our side. Your campaign and applications are unchanged."
      action={
        <Button variant="primary" size="small" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
