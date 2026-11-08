"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  EMPTY_TOAST_STATE,
  hideToast,
  nextToast,
  pushToast,
  toastDuration,
  type ToastMessage,
  type ToastState,
  type ToastTone,
} from "./toast-state";

// Page-level toast. The visible pill is decorative (aria-hidden); two live regions that are always in the
// DOM carry the same text so screen readers hear every message: confirmations politely (role=status),
// errors assertively (role=alert). The newest message replaces the pill at once; errors stay up longer.

type Notify = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<Notify>(() => undefined);

export function useToast(): Notify {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(EMPTY_TOAST_STATE);
  const last = useRef<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Updates are functional so several notifies in one tick all land in state; one hide timer for the newest.
  const notify = useCallback<Notify>((text, tone = "ok") => {
    const message = nextToast(last.current, text, tone);
    last.current = message;
    setState((prev) => pushToast(prev, message));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((prev) => hideToast(prev, message.id)), toastDuration(tone));
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <ToastRegions state={state} />
    </ToastContext.Provider>
  );
}

/** Spans are keyed by the message id, so the same text sent twice is a new node and is announced again. */
export function ToastRegions({ state }: { state: ToastState }) {
  const { visible, status, alert } = state;
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {status ? <span key={status.id}>{status.text}</span> : null}
      </div>
      <div role="alert" aria-atomic="true" className="sr-only">
        {alert ? <span key={alert.id}>{alert.text}</span> : null}
      </div>
      <div className={visible?.tone === "error" ? "toast error" : "toast"} aria-hidden="true" hidden={!visible}>
        {visible?.text}
      </div>
    </>
  );
}
