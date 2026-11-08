"use client";

import { useActionState, useEffect, useId, useState, type ChangeEvent } from "react";
import { importContactsAction } from "@/app/(app)/warm-paths/actions";
import { Button } from "@/components/ui";
import { CSV_MAX_BYTES, CSV_MAX_ROWS } from "@/lib/outreach/csv";
import { INITIAL_IMPORT, importSummary, type ImportReport } from "./action-state";
import { useToast } from "./Toast";

const TOO_BIG = "The file is larger than 1 MB. Split it and import the parts.";

export function ImportForm() {
  const [state, action, pending] = useActionState(importContactsAction, INITIAL_IMPORT);
  const [clientError, setClientError] = useState<string | null>(null);
  const notify = useToast();
  const id = useId();

  useEffect(() => {
    if (state.status === "ok" && state.report) notify(importSummary(state.report));
  }, [state, notify]);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setClientError(file && file.size > CSV_MAX_BYTES ? TOO_BIG : null);
  }

  const error = clientError ?? (state.status === "error" ? state.error : null);
  const report = state.status === "ok" ? state.report : null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="field">
        <label htmlFor={`${id}-file`} className="label">
          CSV file
        </label>
        <input id={`${id}-file`} name="file" type="file" accept=".csv,text/csv" required onChange={onFile} aria-describedby={`${id}-hint`} />
        <span id={`${id}-hint`} className="hint">
          Columns: name and company (required), role, relationship, email, notes. Header names can be in any case. Up to{" "}
          {CSV_MAX_ROWS.toLocaleString("en-US")} rows and 1 MB.
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-source`} className="label">
          Where it came from
        </label>
        <select id={`${id}-source`} name="source" defaultValue="csv">
          <option value="csv">A contacts CSV I exported</option>
          <option value="alumni-list">An alumni list I exported</option>
        </select>
      </div>
      <div>
        <Button type="submit" size="small" variant="primary" disabled={pending || Boolean(clientError)}>
          {pending ? "Importing…" : "Import"}
        </Button>
      </div>
      <div aria-live="polite" className="flex flex-col gap-2">
        {error ? (
          <p className="banner hold" role="alert">
            {error}
          </p>
        ) : null}
        {report ? <ImportReportView report={report} /> : null}
      </div>
    </form>
  );
}

function ImportReportView({ report }: { report: ImportReport }) {
  return (
    <div className="banner flex flex-col gap-2">
      <b>{importSummary(report)}</b>
      {report.errors.length > 0 ? (
        <div>
          <span className="label">Rows to fix</span>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {report.errors.map((rowError) => (
              <li key={rowError.row}>
                Row {rowError.row}: {rowError.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.duplicates.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm">Skipped {report.duplicates.length} already in your contacts</summary>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {report.duplicates.map((dup) => (
              <li key={dup.row}>
                Row {dup.row}: {dup.name} at {dup.company}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
