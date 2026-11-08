"use client";

import { useActionState, useEffect, useRef, useState, type RefObject } from "react";
import { Button, buttonClass, Chip } from "@/components/ui";
import { IDLE_RESUME_STATE, type ResumeActionState } from "./action-state";
import type { ResumeFormAction } from "./ResumeUploadForm";
import { busyButtonState, guardBusyPress } from "./busy-button";

export interface ResumeListItem {
  id: string;
  filename: string;
  isDefault: boolean;
  uploadedLabel: string;
  wordCount: number;
  downloadHref: string;
}

export interface ResumeListProps {
  resumes: ResumeListItem[];
  setDefaultAction: ResumeFormAction;
  deleteAction: ResumeFormAction;
}

const latest = (a: ResumeActionState, b: ResumeActionState): ResumeActionState => (a.nonce >= b.nonce ? a : b);
const deleteButtonId = (resumeId: string): string => `resume-delete-${resumeId}`;

interface DeleteControlsProps {
  resume: ResumeListItem;
  confirming: boolean;
  busy: boolean;
  remove: (formData: FormData) => void;
  confirmRef: RefObject<HTMLButtonElement | null>;
  onAsk: () => void;
  onCancel: () => void;
}

/**
 * "Delete" first; pressing it swaps in the confirm and Cancel buttons for that row. While busy both are
 * aria-disabled and ignore presses (not `disabled`, which would drop focus to <body>).
 */
function DeleteControls({ resume, confirming, busy, remove, confirmRef, onAsk, onCancel }: DeleteControlsProps) {
  const busyState = busyButtonState(busy);
  if (!confirming) {
    return (
      <Button
        id={deleteButtonId(resume.id)}
        size="small"
        {...busyState}
        onClick={(event) => {
          if (guardBusyPress(busy, event)) return;
          onAsk();
        }}
      >
        Delete<span className="sr-only"> {resume.filename}</span>
      </Button>
    );
  }
  return (
    <form action={remove} className="flex gap-2">
      <input type="hidden" name="resumeId" value={resume.id} />
      <button
        ref={confirmRef}
        type="submit"
        className={buttonClass({ size: "small" }, "text-hold")}
        {...busyState}
        onClick={(event) => {
          guardBusyPress(busy, event);
        }}
      >
        Delete {resume.filename}
      </button>
      <Button size="small" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

/** The user's resumes with Download / Make default / Delete (delete asks for confirmation inline). */
export function ResumeList({ resumes, setDefaultAction, deleteAction }: ResumeListProps) {
  const [defaultState, setDefault, settingDefault] = useActionState(setDefaultAction, IDLE_RESUME_STATE);
  const [deleteState, remove, deleting] = useActionState(deleteAction, IDLE_RESUME_STATE);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // The row whose confirmation was just cancelled, so its Delete button gets focus back.
  const cancelled = useRef<string | null>(null);
  const state = latest(defaultState, deleteState);
  const busy = settingDefault || deleting;

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
      return;
    }
    const resumeId = cancelled.current;
    cancelled.current = null;
    if (resumeId) document.getElementById(deleteButtonId(resumeId))?.focus();
  }, [confirming]);

  useEffect(() => {
    if (deleteState.status !== "error") return;
    // Delete was refused: keep the user on the row's confirm button so they can retry or cancel.
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (lost) confirmRef.current?.focus();
  }, [deleteState]);

  const cancel = (resumeId: string) => {
    cancelled.current = resumeId;
    setConfirming(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="list m-0 p-0 list-none" aria-label="Your resumes">
        {resumes.map((resume) => (
          <li key={resume.id} className="row">
            <div className="logo" aria-hidden="true">
              {resume.filename.split(".").pop()?.toUpperCase().slice(0, 4) ?? "CV"}
            </div>
            <div className="min-w-0">
              <div className="t truncate">{resume.filename}</div>
              <div className="meta">
                <span>Uploaded {resume.uploadedLabel}</span>
                <span>{resume.wordCount.toLocaleString("en-US")} words read</span>
                {resume.isDefault ? <Chip tone="ok">Default</Chip> : null}
              </div>
            </div>
            <div className="side flex-wrap">
              <a className="btn small" href={resume.downloadHref} download>
                Download<span className="sr-only"> {resume.filename}</span>
              </a>
              {resume.isDefault ? null : (
                <form action={setDefault}>
                  <input type="hidden" name="resumeId" value={resume.id} />
                  <Button type="submit" size="small" disabled={busy}>
                    Make default<span className="sr-only"> {resume.filename}</span>
                  </Button>
                </form>
              )}
              <DeleteControls
                resume={resume}
                confirming={confirming === resume.id}
                busy={busy}
                remove={remove}
                confirmRef={confirmRef}
                onAsk={() => setConfirming(resume.id)}
                onCancel={() => cancel(resume.id)}
              />
            </div>
          </li>
        ))}
      </ul>
      <div aria-live="polite">
        {state.status === "error" ? (
          <p className="banner hold" role="alert">
            {state.message}
          </p>
        ) : state.status === "success" ? (
          <p className="banner" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
