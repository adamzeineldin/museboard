"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_MS = 3200;

export interface ToastApi {
  message: string;
  show: (message: string) => void;
}

/** Transient message, like the prototype's toast. */
export function useToast(): ToastApi {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(""), TOAST_MS);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { message, show };
}

/** The live region stays mounted so screen readers announce each new message. */
export function Toast({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={message ? "toast" : "sr-only"}>
      {message}
    </div>
  );
}
