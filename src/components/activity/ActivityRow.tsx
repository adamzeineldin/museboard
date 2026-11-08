"use client";

import { Button, Chip } from "@/components/ui";
import type { ActivityRowModel } from "./rows";
import { initials } from "./view-model";
import { PacketView } from "./PacketView";

export interface ActivityRowProps {
  row: ActivityRowModel;
  busy: boolean;
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
  onMarkSubmitted: (id: string) => void;
}

function RowActions({ row, busy, onApprove, onSkip, onMarkSubmitted }: ActivityRowProps) {
  const name = `${row.companyName} · ${row.title}`;
  if (row.status === "waiting") {
    return (
      <>
        <Button size="small" variant="primary" onClick={() => onApprove(row.id)} disabled={busy} aria-label={`Approve ${name}`}>
          Approve
        </Button>
        <Button size="small" onClick={() => onSkip(row.id)} disabled={busy} aria-label={`Skip ${name}`}>
          Skip
        </Button>
      </>
    );
  }
  if (row.status === "prepared") {
    return (
      <>
        <Chip tone="ok">Ready to submit</Chip>
        {row.jobUrl ? (
          <a className="btn small" href={row.jobUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open application for ${name} (opens in a new tab)`}>
            Open application
          </a>
        ) : null}
        <Button size="small" variant="primary" onClick={() => onMarkSubmitted(row.id)} disabled={busy} aria-label={`Mark ${name} as submitted`}>
          Mark as submitted
        </Button>
      </>
    );
  }
  if (row.status === "submitted") return <Chip tone="ok">Applied{row.approvedByYou ? " · approved by you" : ""}</Chip>;
  return <Chip tone="neutral">Skipped</Chip>;
}

export function ActivityRow(props: ActivityRowProps) {
  const { row } = props;
  return (
    <li className="row">
      <div className="logo" aria-hidden="true">
        {initials(row.companyName)}
      </div>
      <div className="min-w-0">
        <div className="t">
          {row.companyName} · {row.title}
        </div>
        <div className="meta">
          <span>{row.reason}</span>
          {row.resumeFilename ? <span className="mono">{row.resumeFilename}</span> : null}
        </div>
      </div>
      <div className="side flex-wrap">
        <RowActions {...props} />
      </div>
      <div className="col-span-full flex flex-col gap-2">
        {row.status === "prepared" && row.packet ? <PacketView packet={row.packet} /> : null}
        <details className="text-sm">
          <summary className="muted cursor-pointer">History ({row.history.length})</summary>
          {row.history.length === 0 ? (
            <p className="muted mt-2">No history recorded.</p>
          ) : (
            <ol className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {row.history.map((entry) => (
                <li key={entry.id} className="flex flex-wrap gap-x-2">
                  <time dateTime={entry.iso} className="muted">
                    {entry.when}
                  </time>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ol>
          )}
        </details>
      </div>
    </li>
  );
}
