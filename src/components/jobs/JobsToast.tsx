"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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
const TOAST_MS = 7000;

export function useJobsToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useJobsToast must be used inside <JobsToastProvider>");
  return api;
}

export function JobsToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const show = useCallback<ToastApi["show"]>((text, options = {}) => {
    setToast({ id: Date.now(), text, tone: options.tone ?? "ok", activityLink: options.activityLink ?? true });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div key={toast.id} className="toast flex flex-wrap items-center gap-3 max-w-[calc(100vw-32px)]">
            <span>{toast.text}</span>
            {toast.activityLink ? (
              <Link href="/activity" className="underline underline-offset-2">
                Open Activity
              </Link>
            ) : null}
            <button type="button" className="bg-transparent border-0 text-inherit px-1" onClick={() => setToast(null)} aria-label="Dismiss message">
              ×
            </button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
