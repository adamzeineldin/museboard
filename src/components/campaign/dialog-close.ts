// What to do when the browser closes a modal dialog by itself (e.g. a second Escape it won't let us cancel).

export type NativeCloseAction = "none" | "cancel" | "reopen";

/**
 * "none" when React already closed it, "reopen" while an action is in flight (its outcome must stay visible),
 * otherwise "cancel" so React state follows the browser.
 */
export function nativeCloseAction({ open, busy }: { open: boolean; busy: boolean }): NativeCloseAction {
  if (!open) return "none";
  return busy ? "reopen" : "cancel";
}
