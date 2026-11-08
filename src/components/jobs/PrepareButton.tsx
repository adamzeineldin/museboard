"use client";

import { useEffect, useRef, useTransition, type MouseEvent } from "react";
import { Button } from "@/components/ui";
import type { PrepareActionResult } from "@/app/(app)/jobs/prepare-message";
import { useJobsToast } from "./JobsToast";
import { armedAfterOutcome, hadFocusAtActivation, restoreFocusIfLost, type PrepareOutcome } from "./prepare-focus";
import { canPrepare, prepareButtonState } from "./prepare-state";

export interface PrepareButtonProps {
  jobId: string;
  jobLabel: string;
  /** The job's Application status; the button hides once there is nothing left to prepare. */
  applicationStatus: string | null;
  /** Element (tabIndex -1) that takes focus when the button disappears after the user pressed it. */
  focusTargetId: string;
  prepare: (jobId: string) => Promise<PrepareActionResult>;
}

/**
 * "Prepare": creates the Application (prepared or held) and toasts the outcome. The component stays
 * mounted (rendering nothing) once the job is prepared, so it can hand focus to the card heading
 * instead of leaving keyboard and screen-reader users on <body>.
 */
export function PrepareButton({ jobId, jobLabel, applicationStatus, focusTargetId, prepare }: PrepareButtonProps) {
  const [pending, startTransition] = useTransition();
  const toast = useJobsToast();
  // The request whose focus hand-off is armed (null when none), so a stale or settled request never moves focus.
  const armedRequest = useRef<number | null>(null);
  const lastRequest = useRef(0);
  const visible = canPrepare(applicationStatus);

  useEffect(() => {
    if (visible || armedRequest.current === null) return;
    armedRequest.current = null;
    restoreFocusIfLost(document, focusTargetId);
  }, [visible, focusTargetId]);

  const settle = (requestId: number, outcome: PrepareOutcome) => {
    armedRequest.current = armedAfterOutcome(armedRequest.current, requestId, outcome);
  };

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    // aria-disabled rather than disabled while pending: disabling the focused button drops focus to <body>.
    if (pending) return;
    const requestId = lastRequest.current + 1;
    lastRequest.current = requestId;
    armedRequest.current = hadFocusAtActivation(document, event.currentTarget) ? requestId : null;
    startTransition(async () => {
      try {
        const result = await prepare(jobId);
        settle(requestId, result.ok ? { ok: true, status: result.status } : { ok: false });
        toast.show(result.message, { tone: result.ok ? "ok" : "error", activityLink: result.ok });
      } catch {
        settle(requestId, { ok: false });
        toast.show("We couldn't reach Inroad. Check your connection and try again.", { tone: "error", activityLink: false });
      }
    });
  };

  if (!visible) return null;
  const { label, ...ariaState } = prepareButtonState(pending);
  return (
    <Button
      size="small"
      onClick={onClick}
      onBlur={(event) => {
        // The user moved on to something else, so don't pull focus back later.
        if (event.relatedTarget) armedRequest.current = null;
      }}
      {...ariaState}
      className="aria-disabled:cursor-wait aria-disabled:opacity-70"
    >
      {label}
      <span className="sr-only"> {jobLabel}</span>
    </Button>
  );
}
