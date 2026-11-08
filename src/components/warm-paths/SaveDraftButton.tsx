"use client";

import { useTransition } from "react";
import { saveDraftAction } from "@/app/(app)/warm-paths/actions";
import { Button } from "@/components/ui";
import type { OutreachKind } from "@/lib/types";
import { useToast } from "./Toast";
import { resultToast } from "./toast-state";

export interface SaveDraftButtonProps {
  contactId: string;
  kind: OutreachKind;
  jobId: string | null;
}

export function SaveDraftButton({ contactId, kind, jobId }: SaveDraftButtonProps) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const result = await saveDraftAction({ contactId, kind, jobId: jobId ?? undefined });
        const { text, tone } = resultToast(result);
        notify(text, tone);
      } catch {
        notify("We couldn't save this draft. Check your connection and try again.", "error");
      }
    });
  }

  return (
    <Button size="small" variant="primary" onClick={save} disabled={pending}>
      {pending ? "Saving…" : "Save draft"}
    </Button>
  );
}
