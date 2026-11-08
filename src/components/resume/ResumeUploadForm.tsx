"use client";

import { useActionState, useId, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui";
import { MAX_RESUME_MB, RESUME_ACCEPT } from "@/lib/resume/constants";
import { IDLE_RESUME_STATE, type ResumeActionState } from "./action-state";
import { activeChoice, chooseFile, type FileChoice } from "./file-choice";

export type ResumeFormAction = (prev: ResumeActionState, formData: FormData) => Promise<ResumeActionState>;

export interface ResumeUploadFormProps {
  action: ResumeFormAction;
  /** Label for the submit button, e.g. "Upload resume". */
  submitLabel?: string;
}

export function ResumeUploadForm({ action, submitLabel = "Upload resume" }: ResumeUploadFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_RESUME_STATE);
  const [choice, setChoice] = useState<FileChoice | null>(null);
  // A new action result means React reset the form, so the earlier pick (and its problem) is gone.
  const picked = activeChoice(choice, state);
  const hasFile = picked !== null;
  const localError = picked?.problem ?? null;
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setChoice(chooseFile(event.target.files?.[0], state));
  };

  const error = localError ?? (state.status === "error" ? state.message : null);
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <div className="field">
        <label className="label" htmlFor={inputId}>
          Resume file
        </label>
        <input
          id={inputId}
          name="resume"
          type="file"
          accept={RESUME_ACCEPT}
          required
          onChange={onChange}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
        />
        <span id={hintId} className="hint">
          PDF, DOCX or TXT, up to {MAX_RESUME_MB} MB. Inroad reads the text to rank jobs; the file is only shared when you
          send a packet.
        </span>
      </div>
      <div aria-live="polite">
        {error ? (
          <p id={errorId} className="banner hold" role="alert">
            {error}
          </p>
        ) : state.status === "success" && !pending ? (
          <p className="banner" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending || !hasFile || Boolean(localError)}>
          {pending ? "Uploading…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
