"use client";

import { useActionState } from "react";
import { Button, Panel } from "@/components/ui";
import { IDLE_DIGEST_STATE, type DigestToggleState } from "./digest-toggle-state";

export interface DigestSectionProps {
  enabled: boolean;
  action: (prev: DigestToggleState, formData: FormData) => Promise<DigestToggleState>;
}

/** Settings → Weekly digest: one switch for User.digestOptOut. */
export function DigestSection({ enabled: initial, action }: DigestSectionProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_DIGEST_STATE);
  const enabled = state.enabled ?? initial;
  return (
    <Panel aria-labelledby="digest-title">
      <div className="flex flex-col gap-1">
        <h2 id="digest-title">Weekly digest</h2>
        <p className="muted" id="digest-hint">
          A Monday email with what went out, what&apos;s waiting on you and a link to pause your campaign. Turning it off
          doesn&apos;t change your campaign.
        </p>
      </div>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="digest" value={enabled ? "off" : "on"} />
        <Button
          type="submit"
          role="switch"
          aria-checked={enabled}
          aria-describedby="digest-hint"
          disabled={pending}
          className="switch-btn"
        >
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          Weekly digest email: {enabled ? "On" : "Off"}
        </Button>
      </form>
      <div aria-live="polite">
        {state.status === "error" ? (
          <p className="banner hold" role="alert">
            {state.message}
          </p>
        ) : state.status === "success" && !pending ? (
          <p className="banner" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
