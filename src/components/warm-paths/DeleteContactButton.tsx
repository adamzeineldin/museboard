"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteContactAction } from "@/app/(app)/warm-paths/actions";
import { Button } from "@/components/ui";
import { useToast } from "./Toast";
import { resultToast } from "./toast-state";
import { WARM_PATHS_PATH } from "./selection";

export interface DeleteContactButtonProps {
  contactId: string;
  contactName: string;
}

/** Two-step delete: the first press asks for confirmation inline, the second deletes. */
export function DeleteContactButton({ contactId, contactName }: DeleteContactButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const notify = useToast();
  const router = useRouter();

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function remove() {
    startTransition(async () => {
      try {
        const result = await deleteContactAction(contactId);
        const { text, tone } = resultToast(result);
        notify(text, tone);
        if (result.ok) router.replace(WARM_PATHS_PATH, { scroll: false });
        else setConfirming(false);
      } catch {
        notify("We couldn't delete that contact. Check your connection and try again.", "error");
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <Button size="small" onClick={() => setConfirming(true)}>
        Delete contact
      </Button>
    );
  }
  return (
    <div role="group" aria-label={`Confirm deleting ${contactName}`} className="flex flex-wrap items-center gap-2">
      <span className="text-sm">Delete {contactName} and their drafts? This can&apos;t be undone.</span>
      <button ref={confirmRef} type="button" className="btn small border-hold text-hold" onClick={remove} disabled={pending}>
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <Button size="small" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}
