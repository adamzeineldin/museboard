"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui";
import type { LinkOutcome } from "@/lib/digest/link-outcome";

// The confirm step for a one-click email link. The page (GET) only shows this button; the change happens
// when the user submits (POST to a server action), so mail scanners that prefetch links change nothing.

export type LinkAction = (previous: LinkOutcome, formData: FormData) => Promise<LinkOutcome>;

export interface LinkActionFormProps {
  initial: LinkOutcome;
  token: string;
  action: LinkAction;
  confirmLabel: string;
  pendingLabel: string;
  /** Where "Open Inroad" goes (signing in if needed). */
  appHref: string;
}

const FAILED: readonly LinkOutcome["status"][] = ["invalid", "expired", "error"];

export function LinkActionForm({ initial, token, action, confirmLabel, pendingLabel, appHref }: LinkActionFormProps) {
  const [state, formAction, pending] = useActionState<LinkOutcome, FormData>(action, initial);

  if (state.status === "ready") {
    return (
      <form action={formAction}>
        <p>{state.message}</p>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending || undefined}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </form>
    );
  }

  const failed = FAILED.includes(state.status);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p className={failed ? "banner hold" : "banner"} role={failed ? "alert" : "status"}>
        {state.message}
      </p>
      <Link className={buttonClass({ variant: "default" })} href={appHref}>
        Open Inroad
      </Link>
    </div>
  );
}
