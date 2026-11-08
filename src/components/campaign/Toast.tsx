"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_MS = 3200;
const ERROR_TOAST_MS = 8000;

export type ToastTone = "ok" | "error";

export interface ToastApi {
  message: string;
  tone: ToastTone;
  show: (message: string, tone?: ToastTone) => void;
}

/** Transient message, like the prototype's toast. Errors stay up longer. */
export function useToast(): ToastApi {
  const [state, setState] = useState<{ message: string; tone: ToastTone }>({ message: "", tone: "ok" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: string, tone: ToastTone = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setState({ message: next, tone });
    timer.current = setTimeout(() => setState({ message: "", tone: "ok" }), tone === "error" ? ERROR_TOAST_MS : TOAST_MS);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { message: state.message, tone: state.tone, show };
}

/**
 * Both live regions stay mounted so screen readers announce each new message: successes politely
 * (role=status), errors assertively (role=alert). The visible pill repeats the text and is hidden from AT.
 */
export function Toast({ message, tone = "ok" }: { message: string; tone?: ToastTone }) {
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {tone === "ok" ? message : ""}
      </div>
      <div role="alert" aria-atomic="true" className="sr-only">
        {tone === "error" ? message : ""}
      </div>
      <div className={tone === "error" ? "toast error" : "toast"} aria-hidden="true" hidden={!message}>
        {message}
      </div>
    </>
  );
}
