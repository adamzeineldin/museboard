"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FocusEvent, type ReactNode } from "react";
import { isToastPaused, toastTimeoutMs, withPauseReason, type PauseReason, type ToastPause } from "./toast-timer";

// One toast region for the Jobs feed. The live region is always in the DOM so screen readers
// announce each new message; the visible pill matches the prototype's .toast.

export interface ToastMessage {
  id: number;
  text: string;
  tone: "ok" | "error";
  /** Show "Open Activity" next to the text. */
  activityLink: boolean;
}

interface ToastApi {
  show(text: string, options?: { tone?: ToastMessage["tone"]; activityLink?: boolean }): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useJobsToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useJobsToast must be used inside <JobsToastProvider>");
  return api;
}

interface ToastPillProps {
  toast: ToastMessage;
  onDismiss: () => void;
  /** Report hover/focus so the auto-dismiss timer waits while the user is using the toast. */
  onPause: (reason: PauseReason, on: boolean) => void;
}

function ToastPill({ toast, onDismiss, onPause }: ToastPillProps) {
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onPause("focus", false);
  };
  return (
    <div
      key={toast.id}
      className={`toast flex flex-wrap items-center gap-3 max-w-[calc(100vw-32px)]${toast.tone === "error" ? " error" : ""}`}
      onMouseEnter={() => onPause("hover", true)}
      onMouseLeave={() => onPause("hover", false)}
      onFocus={() => onPause("focus", true)}
      onBlur={onBlur}
    >
      <span>{toast.text}</span>
      {toast.activityLink ? (
        <Link href="/activity" className="underline underline-offset-2">
          Open Activity
        </Link>
      ) : null}
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss message">
        ×
      </button>
    </div>
  );
}

export function JobsToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [pause, setPause] = useState<ToastPause | null>(null);
  const toastId = toast?.id ?? null;
  const paused = isToastPaused(pause, toastId);

  const show = useCallback<ToastApi["show"]>((text, options = {}) => {
    setToast({ id: Date.now(), text, tone: options.tone ?? "ok", activityLink: options.activityLink ?? true });
  }, []);

  // Restarts on each new toast and whenever the user stops hovering or focusing it.
  useEffect(() => {
    const ms = toastTimeoutMs(toastId !== null, paused);
    if (ms === null) return undefined;
    const timer = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(timer);
  }, [toastId, paused]);

  const onPause = useCallback(
    (reason: PauseReason, on: boolean) => {
      if (toastId !== null) setPause((prev) => withPauseReason(prev, toastId, reason, on));
    },
    [toastId],
  );
  const dismiss = useCallback(() => setToast(null), []);

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Both regions stay mounted: successes are announced politely, errors assertively. */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {toast?.tone === "ok" ? <ToastPill toast={toast} onDismiss={dismiss} onPause={onPause} /> : null}
      </div>
      <div role="alert" aria-atomic="true">
        {toast?.tone === "error" ? <ToastPill toast={toast} onDismiss={dismiss} onPause={onPause} /> : null}
      </div>
    </ToastContext.Provider>
  );
}
