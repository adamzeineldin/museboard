"use client";

import { useOptimistic, useTransition } from "react";
import { markPreviewSentAction, setSentAction } from "@/app/(app)/warm-paths/actions";
import type { OutreachKind } from "@/lib/types";
import type { ActionResult } from "./action-state";
import { useToast } from "./Toast";

export type SentToggleTarget =
  | { type: "saved"; outreachId: string }
  | { type: "preview"; contactId: string; kind: OutreachKind; jobId: string | null };

export interface SentToggleProps {
  target: SentToggleTarget;
  sent: boolean;
  /** Who it's to, for the accessible name. */
  contactName: string;
}

/**
 * "Mark as sent": set by the user after they send the message themselves. Inroad never sends anything.
 * Pressing it again returns the draft to 'draft'.
 */
export function SentToggle({ target, sent, contactName }: SentToggleProps) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [optimisticSent, setOptimisticSent] = useOptimistic(sent);

  function toggle() {
    const next = !optimisticSent;
    startTransition(async () => {
      setOptimisticSent(next);
      let result: ActionResult;
      try {
        result =
          target.type === "saved"
            ? await setSentAction({ outreachId: target.outreachId, sent: next })
            : await markPreviewSentAction({ contactId: target.contactId, kind: target.kind, jobId: target.jobId ?? undefined });
      } catch {
        result = { ok: false, error: "We couldn't update this draft. Check your connection and try again." };
      }
      notify(result.ok ? result.message : result.error);
    });
  }

  return (
    <button
      type="button"
      className="toggle"
      aria-pressed={optimisticSent}
      aria-label={`Mark as sent: message to ${contactName}`}
      onClick={toggle}
      disabled={pending || (target.type === "preview" && optimisticSent)}
    >
      <span aria-hidden="true">{optimisticSent ? "✓ " : ""}</span>Mark as sent
    </button>
  );
}
