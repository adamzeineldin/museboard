"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { nativeCloseAction } from "./dialog-close";

export interface RevokeDialogProps {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Runs right after the dialog closes (and the browser has returned focus to the opener). */
  onClosed?: () => void;
}

/** Native modal dialog: focus is trapped, Escape cancels (except while busy), focus returns to the opener. */
export function RevokeDialog({ open, busy, onCancel, onConfirm, onClosed }: RevokeDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    // Also runs when the browser closed the dialog first, so focus handling never depends on who closed it.
    if (!open && wasOpen.current) onClosed?.();
    wasOpen.current = open;
  }, [open, onClosed]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="revoke-title"
      aria-describedby="revoke-body"
      onCancel={(event) => {
        // Escape never closes the dialog by itself, and is ignored while the revoke is in flight.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => {
        // The browser can close the dialog by itself (e.g. a repeated Escape); keep React state in step with it.
        const action = nativeCloseAction({ open, busy });
        if (action === "reopen") ref.current?.showModal();
        if (action === "cancel") onCancel();
      }}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-5 text-fg shadow-card backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3">
        <h2 id="revoke-title">Revoke this campaign?</h2>
        <p id="revoke-body" className="muted">
          Inroad stops applying for you. Applications already prepared stay in Activity, and anything new comes back to you
          for a yes. To start again you approve a fresh set of rules.
        </p>
        <div className="actions">
          <Button variant="primary" onClick={onConfirm} disabled={busy}>
            {busy ? "Revoking…" : "Revoke campaign"}
          </Button>
          <Button onClick={onCancel} disabled={busy} autoFocus>
            Keep it
          </Button>
        </div>
      </div>
    </dialog>
  );
}
