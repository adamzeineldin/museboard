"use client";

import { useTransition } from "react";
import { saveDraftAction } from "@/app/(app)/warm-paths/actions";
import { Button } from "@/components/ui";
import type { OutreachKind } from "@/lib/types";
import { useToast } from "./Toast";

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
        notify(result.ok ? result.message : result.error);
      } catch {
        notify("We couldn't save this draft. Check your connection and try again.");
      }
    });
  }

  return (
    <Button size="small" variant="primary" onClick={save} disabled={pending}>
      {pending ? "Saving…" : "Save draft"}
    </Button>
  );
}
