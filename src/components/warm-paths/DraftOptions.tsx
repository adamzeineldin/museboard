"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { OUTREACH_KINDS, type OutreachKind } from "@/lib/types";
import { KIND_LABELS, NO_JOB, warmPathsHref } from "./selection";

export interface DraftOptionsProps {
  contactId: string;
  kind: OutreachKind;
  jobId: string | null;
  jobs: Array<{ id: string; title: string }>;
  companyName: string;
}

/** Kind switch (coffee chat / referral ask) and role picker. Both live in the URL. */
export function DraftOptions({ contactId, kind, jobId, jobs, companyName }: DraftOptionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectId = useId();

  // Keep "No specific role" sticky across kind switches; otherwise the newest open job would be picked again.
  const currentJob = jobId ?? (jobs.length > 0 ? NO_JOB : null);
  const go = (next: { kind?: OutreachKind; jobId?: string }) => {
    const href = warmPathsHref({ contactId, kind: next.kind ?? kind, jobId: next.jobId ?? currentJob });
    startTransition(() => router.replace(href, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending || undefined}>
      <div role="group" aria-label="Kind of message" className="opts">
        {OUTREACH_KINDS.map((option) => (
          <button key={option} type="button" className="toggle" aria-pressed={option === kind} onClick={() => go({ kind: option })}>
            {KIND_LABELS[option]}
          </button>
        ))}
      </div>
      <div className="field min-w-0 flex-1 basis-56">
        <label htmlFor={selectId} className="label">
          Role
        </label>
        {jobs.length > 0 ? (
          <select id={selectId} value={jobId ?? NO_JOB} onChange={(event) => go({ jobId: event.target.value })}>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
            <option value={NO_JOB}>No specific role</option>
          </select>
        ) : (
          <p id={selectId} className="text-sm text-muted">
            No open roles at {companyName} right now. The draft asks about the company in general.
          </p>
        )}
      </div>
    </div>
  );
}
