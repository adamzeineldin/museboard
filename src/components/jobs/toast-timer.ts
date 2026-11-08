// Auto-dismiss timing for the Jobs toast. The toast holds a link and a button, so it waits while the
// pointer is over it or focus is inside it (WCAG 2.2.1). Pure.

export const TOAST_MS = 7000;

export type PauseReason = "hover" | "focus";

export interface ToastPause {
  /** The toast this pause belongs to; a newer toast starts unpaused. */
  id: number;
  hover: boolean;
  focus: boolean;
}

export function withPauseReason(prev: ToastPause | null, id: number, reason: PauseReason, on: boolean): ToastPause {
  const base = prev?.id === id ? prev : { id, hover: false, focus: false };
  return { ...base, [reason]: on };
}

export function isToastPaused(pause: ToastPause | null, toastId: number | null): boolean {
  return pause !== null && pause.id === toastId && (pause.hover || pause.focus);
}

/** Milliseconds until the toast closes, or null when no timer should run. */
export function toastTimeoutMs(hasToast: boolean, paused: boolean): number | null {
  return hasToast && !paused ? TOAST_MS : null;
}
