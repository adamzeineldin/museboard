// Busy state for the resume row buttons. Pure; safe to import from client components.

export interface BusyButtonState {
  "aria-disabled": true | undefined;
  "aria-busy": true | undefined;
}

/**
 * Busy marks a button aria-disabled (never `disabled`): disabling the focused button would drop focus to
 * <body> while a request runs. Pair it with `guardBusyPress` so presses do nothing while busy.
 */
export function busyButtonState(busy: boolean): BusyButtonState {
  return { "aria-disabled": busy || undefined, "aria-busy": busy || undefined };
}

/** Cancels a press (including a form submit) while busy; returns true when the press was blocked. */
export function guardBusyPress(busy: boolean, event: Pick<Event, "preventDefault">): boolean {
  if (!busy) return false;
  event.preventDefault();
  return true;
}
