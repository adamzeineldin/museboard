"use client";

import { useActionState, useId, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui";
import { MAX_RESUME_BYTES, MAX_RESUME_MB, RESUME_ACCEPT } from "@/lib/resume/constants";
import { IDLE_RESUME_STATE, type ResumeActionState } from "./action-state";

export type ResumeFormAction = (prev: ResumeActionState, formData: FormData) => Promise<ResumeActionState>;

export interface ResumeUploadFormProps {
  action: ResumeFormAction;
  /** Label for the submit button, e.g. "Upload resume". */
  submitLabel?: string;
}

const ALLOWED_EXTENSION = /\.(pdf|docx|txt)$/i;

/** Quick client-side check; the server re-checks size and magic bytes. */
function clientProblem(file: File | undefined): string | null {
  if (!file) return null;
  if (!ALLOWED_EXTENSION.test(file.name)) return "Upload a PDF, DOCX or TXT file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_RESUME_BYTES) return `That file is larger than ${MAX_RESUME_MB} MB. Upload a smaller file.`;
  return null;
}

export function ResumeUploadForm({ action, submitLabel = "Upload resume" }: ResumeUploadFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_RESUME_STATE);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setHasFile(Boolean(file));
    setLocalError(clientProblem(file));
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
