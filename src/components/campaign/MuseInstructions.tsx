"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { MUSE_INSTRUCTIONS_MAX } from "@/lib/muse-instructions/schema";
import { IDLE_INSTRUCTIONS_STATE, type InstructionsState } from "./instructions-state";

export interface MuseInstructionsProps {
  initial: string;
  action: (prev: InstructionsState, formData: FormData) => Promise<InstructionsState>;
}

const PLACEHOLDER = [
  "e.g. Prioritize fintech and developer-tools companies.",
  "Mention my hackathon win when there's a \"why us\" question.",
  "Don't apply to roles that require relocating outside the US.",
].join("\n");

/** Free-form instructions Muse reads alongside the approved rules. */
export function MuseInstructions({ initial, action }: MuseInstructionsProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_INSTRUCTIONS_STATE);
  const [text, setText] = useState(initial);
  const savedText = state.status === "success" ? (state.value ?? "") : initial;
  const dirty = text.trim() !== savedText.trim();
  const over = text.length > MUSE_INSTRUCTIONS_MAX;
  return (
    <section className="panel" aria-labelledby="instructions-title">
      <div className="flex flex-col gap-1">
        <h2 id="instructions-title">Instructions for Muse</h2>
        <p className="muted text-[13px]" id="instructions-hint">
          Anything your rules can&apos;t say: what to prioritize, how to answer questions, what to avoid. Muse reads this in
          Meta&apos;s cloud whenever it checks your rules. It can&apos;t override your approved rules or weekly limit.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="muse-instructions">
          Instructions for Muse
        </label>
        <textarea
          id="muse-instructions"
          name="instructions"
          rows={6}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={PLACEHOLDER}
          aria-describedby="instructions-hint instructions-count"
          aria-invalid={over || state.status === "error" ? true : undefined}
          className="instructions-box"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending || over || !dirty}>
            {pending ? "Saving…" : "Save instructions"}
          </Button>
          <span id="instructions-count" className={over ? "text-[12px] text-hold" : "muted mono"}>
            {text.length}/{MUSE_INSTRUCTIONS_MAX}
          </span>
          {state.message ? (
            <span role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-[13px] text-hold" : "muted text-[13px]"}>
              {state.message}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
