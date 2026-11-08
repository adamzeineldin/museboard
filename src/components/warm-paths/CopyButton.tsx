"use client";

import { Button } from "@/components/ui";
import { useToast } from "./Toast";

export interface CopyButtonProps {
  /** id of the element whose text is copied. */
  targetId: string;
  /** Accessible name, e.g. "Copy draft to Priya N.". */
  label: string;
}

function selectContents(element: HTMLElement): void {
  const details = element.closest("details");
  if (details) details.open = true;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  element.focus();
}

/** Copies a draft to the clipboard; where the clipboard isn't available it selects the text instead. */
export function CopyButton({ targetId, label }: CopyButtonProps) {
  const notify = useToast();

  async function copy() {
    const element = document.getElementById(targetId);
    if (!element) {
      notify("Nothing to copy yet", "error");
      return;
    }
    const text = element.innerText || element.textContent || "";
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      notify("Copied");
    } catch {
      selectContents(element);
      notify("Selected. Press Ctrl+C (or ⌘C) to copy");
    }
  }

  return (
    <Button size="small" onClick={copy} aria-label={label}>
      Copy
    </Button>
  );
}
