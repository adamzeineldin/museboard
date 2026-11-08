// Which job cards offer "Prepare". Pure; safe to import from client components.

/** Rows that are ready to submit, already sent, or skipped by the user have nothing left to prepare. */
const DONE_STATUSES: readonly string[] = ["prepared", "submitted", "skipped"];

export function canPrepare(applicationStatus: string | null): boolean {
  return applicationStatus === null || !DONE_STATUSES.includes(applicationStatus);
}

export interface PrepareButtonState {
  label: string;
  "aria-disabled": true | undefined;
  "aria-busy": true | undefined;
}

/**
 * Pending marks the button aria-disabled (never `disabled`): disabling the focused button would drop focus
 * to <body> mid-request. The click handler ignores presses while pending.
 */
export function prepareButtonState(pending: boolean): PrepareButtonState {
  return {
    label: pending ? "Preparing…" : "Prepare",
    "aria-disabled": pending || undefined,
    "aria-busy": pending || undefined,
  };
}
