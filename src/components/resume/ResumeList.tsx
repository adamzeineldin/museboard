"use client";

import { useActionState, useState } from "react";
import { Button, Chip } from "@/components/ui";
import { IDLE_RESUME_STATE, type ResumeActionState } from "./action-state";
import type { ResumeFormAction } from "./ResumeUploadForm";

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

/** The user's resumes with Download / Make default / Delete (delete asks for confirmation inline). */
export function ResumeList({ resumes, setDefaultAction, deleteAction }: ResumeListProps) {
  const [defaultState, setDefault, settingDefault] = useActionState(setDefaultAction, IDLE_RESUME_STATE);
  const [deleteState, remove, deleting] = useActionState(deleteAction, IDLE_RESUME_STATE);
  const [confirming, setConfirming] = useState<string | null>(null);
  const state = latest(defaultState, deleteState);
  const busy = settingDefault || deleting;

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
              {confirming === resume.id ? (
                <form action={remove} className="flex gap-2">
                  <input type="hidden" name="resumeId" value={resume.id} />
                  <Button type="submit" size="small" disabled={busy} className="text-hold">
                    Delete {resume.filename}
                  </Button>
                  <Button size="small" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <Button size="small" disabled={busy} onClick={() => setConfirming(resume.id)}>
                  Delete<span className="sr-only"> {resume.filename}</span>
                </Button>
              )}
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
