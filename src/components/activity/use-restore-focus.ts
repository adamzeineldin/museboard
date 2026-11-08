"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

export interface RestoreFocus<T extends HTMLElement> {
  /** Attach to a stable element (with tabIndex={-1}) that survives the action. */
  target: RefObject<T | null>;
  /** Call when this component starts an action that disables or replaces the focused control. */
  markPending: () => void;
}

/**
 * Disabling or replacing the button that was just pressed drops focus to <body>. Once `busy` ends
 * (the action and its refresh are done), put focus back on a stable target in this component,
 * unless the user has already moved focus somewhere else.
 */
export function useRestoreFocus<T extends HTMLElement>(busy: boolean): RestoreFocus<T> {
  const target = useRef<T | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (busy || !pending.current) return;
    pending.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    target.current?.focus();
  }, [busy]);

  const markPending = useCallback(() => {
    pending.current = true;
  }, []);

  return { target, markPending };
}
