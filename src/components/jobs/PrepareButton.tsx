"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import type { PrepareActionResult } from "@/app/(app)/jobs/prepare-message";
import { useJobsToast } from "./JobsToast";

export interface PrepareButtonProps {
  jobId: string;
  jobLabel: string;
  prepare: (jobId: string) => Promise<PrepareActionResult>;
}

/** "Prepare": creates the Application (prepared or held) and toasts the outcome. */
export function PrepareButton({ jobId, jobLabel, prepare }: PrepareButtonProps) {
  const [pending, startTransition] = useTransition();
  const toast = useJobsToast();

  const onClick = () => {
    startTransition(async () => {
      try {
        const result = await prepare(jobId);
        toast.show(result.message, { tone: result.ok ? "ok" : "error", activityLink: result.ok });
      } catch {
        toast.show("We couldn't reach Inroad. Check your connection and try again.", { tone: "error", activityLink: false });
      }
    });
  };

  return (
    <Button size="small" onClick={onClick} disabled={pending} aria-busy={pending || undefined}>
      {pending ? "Preparing…" : "Prepare"}
      <span className="sr-only"> {jobLabel}</span>
    </Button>
  );
}
