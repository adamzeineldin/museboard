// Focus hand-off for the "Prepare" button, which disappears once the job is prepared. Pure apart from the
// document passed in; safe to import from client components.

import { canPrepare } from "./prepare-state";

export type FocusDocument = Pick<Document, "activeElement" | "body" | "getElementById">;

/** Arm the hand-off only when the pressed button holds focus (keyboard press, or a click in browsers that focus buttons). */
export function hadFocusAtActivation(doc: Pick<Document, "activeElement">, button: unknown): boolean {
  return doc.activeElement !== null && doc.activeElement === button;
}

/** Focus `targetId` without scrolling, but only when focus has fallen to <body>; returns whether it moved focus. */
export function restoreFocusIfLost(doc: FocusDocument, targetId: string): boolean {
  const lost = doc.activeElement === null || doc.activeElement === doc.body;
  if (!lost) return false;
  const target = doc.getElementById(targetId);
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}

/** What a finished request did: `ok: false` covers both a refused result and a thrown request. */
export type PrepareOutcome = { ok: true; status: string } | { ok: false };

/**
 * The armed hand-off belongs to one request. When that request finishes, keep it armed only if the result
 * hides the button (the job is now prepared); a refusal, a held result that keeps the button, or a thrown
 * request disarms it so a later refresh never pulls focus.
 */
export function armedAfterOutcome(armed: number | null, requestId: number, outcome: PrepareOutcome): number | null {
  if (armed !== requestId) return armed;
  return outcome.ok && !canPrepare(outcome.status) ? armed : null;
}
