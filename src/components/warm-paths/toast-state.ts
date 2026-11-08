import type { ActionResult } from "./action-state";

// Pure state for the Warm paths toast, kept apart from the provider so it can be unit tested.

export type ToastTone = "ok" | "error";

export interface ToastMessage {
  /** Changes on every notify, so the live region re-announces a repeated message. */
  readonly id: number;
  readonly text: string;
  readonly tone: ToastTone;
}

/**
 * What is on screen and in each live region. The newest message always takes the pill at once (a
 * successful retry makes an earlier error stale). Each region only changes for its own tone, so every
 * notify adds exactly one new node to exactly one region and is announced, even within a single render.
 */
export interface ToastState {
  readonly visible: ToastMessage | null;
  /** Latest confirmation, announced politely (role=status). */
  readonly status: ToastMessage | null;
  /** Latest error, announced assertively (role=alert). */
  readonly alert: ToastMessage | null;
}

export const EMPTY_TOAST_STATE: ToastState = { visible: null, status: null, alert: null };

export const TOAST_MS = 2400;
/** Errors stay up long enough for slow readers and magnifier users to catch them. */
export const ERROR_TOAST_MS = 8000;

export function toastDuration(tone: ToastTone): number {
  return tone === "error" ? ERROR_TOAST_MS : TOAST_MS;
}

export function nextToast(previous: ToastMessage | null, text: string, tone: ToastTone): ToastMessage {
  return { id: (previous?.id ?? 0) + 1, text, tone };
}

/** Shows a message straight away and puts it in the live region for its tone. */
export function pushToast(state: ToastState, message: ToastMessage): ToastState {
  return message.tone === "error"
    ? { ...state, visible: message, alert: message }
    : { ...state, visible: message, status: message };
}

/** Clears the toast when the visible message expires; the expiry of a message already replaced is ignored. */
export function hideToast(state: ToastState, id: number): ToastState {
  return state.visible?.id === id ? EMPTY_TOAST_STATE : state;
}

/** The toast text and tone for a server action result. */
export function resultToast(result: ActionResult): { text: string; tone: ToastTone } {
  return result.ok ? { text: result.message, tone: "ok" } : { text: result.error, tone: "error" };
}
