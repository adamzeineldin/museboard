"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export interface CopyFieldProps {
  label: string;
  value: string;
  /** Hint under the field, e.g. "Shown once". */
  hint?: string;
}

/** A read-only value with a Copy button. Falls back to selecting the text when the clipboard is unavailable. */
export function CopyField({ label, value, hint }: CopyFieldProps) {
  const [status, setStatus] = useState("");
  const inputId = `copy-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      const input = document.getElementById(inputId);
      if (input instanceof HTMLInputElement) input.select();
      setStatus("Selected. Press Ctrl+C (or ⌘C) to copy");
    }
  }

  return (
    <div className="field">
      <label className="label" htmlFor={inputId}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          readOnly
          value={value}
          className="mono min-w-0 flex-1"
          onFocus={(event) => event.currentTarget.select()}
          aria-describedby={hint ? `${inputId}-hint` : undefined}
        />
        <Button size="small" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
          Copy
        </Button>
      </div>
      {hint ? (
        <span id={`${inputId}-hint`} className="hint">
          {hint}
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
