"use client";

import { Button, Chip } from "@/components/ui";
import { stageFor } from "./board";
import type { ActivityRowModel } from "./rows";
import { heldNote } from "./view-model";
import { PacketView } from "./PacketView";
import { heldLabel } from "../release/release-view";
import { useRestoreFocus } from "./use-restore-focus";

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
  if (row.status === "prepared" && row.held) {
    return (
      <>
        <Chip tone="hold">{heldLabel(row.held)}</Chip>
        {row.recordable ? (
          <Button size="small" onClick={() => onMarkSubmitted(row.id)} disabled={busy} aria-label={`Mark as submitted: ${name}`}>
            Mark as submitted
          </Button>
        ) : null}
      </>
    );
  }
  if (row.status === "prepared") {
    return (
      <>
        {row.jobUrl ? (
          <a className="btn small" href={row.jobUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open application for ${name} (opens in a new tab)`}>
            Open application
          </a>
        ) : null}
        <Button size="small" variant="primary" onClick={() => onMarkSubmitted(row.id)} disabled={busy} aria-label={`Mark as submitted: ${name}`}>
          Mark as submitted
        </Button>
      </>
    );
  }
  return null;
}

export function ActivityRow(props: ActivityRowProps) {
  const { row, busy, onApprove, onSkip, onMarkSubmitted } = props;
  // The pressed button is disabled, then replaced when the status changes: return focus to the row title.
  const { target: titleRef, markPending } = useRestoreFocus<HTMLDivElement>(busy);
  const withFocus = (handler: (id: string) => void) => (id: string) => {
    markPending();
    handler(id);
  };
  const note = row.status === "prepared" ? heldNote(row) : null;
  const stage = stageFor(row);
  const hasActions = row.status === "waiting" || row.status === "prepared";
  const actions = (
    <RowActions
      row={row}
      busy={busy}
      onApprove={withFocus(onApprove)}
      onSkip={withFocus(onSkip)}
      onMarkSubmitted={withFocus(onMarkSubmitted)}
    />
  );
  return (
    <li className="app-card">
      <div className="t" tabIndex={-1} ref={titleRef}>
        <span className="co">{row.companyName}</span>
        <span className="sr-only"> · </span>
        <span className="role">{row.title}</span>
      </div>
      <div className="meta">
        {row.reason ? <span>{row.reason}</span> : null}
        {row.resumeFilename ? <span className="mono">{row.resumeFilename}</span> : null}
      </div>
      <div className="foot">
        {row.held ? null : (
          <div className="stage" data-tone={stage.tone}>
            <span className="dot sm" data-tone={stage.tone} aria-hidden="true" />
            {stage.label}
          </div>
        )}
        {note ? <p className="note">{note}</p> : null}
        {hasActions ? <div className="actions">{actions}</div> : null}
        {row.status === "prepared" && !row.held && row.packet ? <PacketView packet={row.packet} /> : null}
        <details>
          <summary>History ({row.history.length})</summary>
          {row.history.length === 0 ? (
            <p className="muted mt-2">No history recorded.</p>
          ) : (
            <ol className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {row.history.map((entry) => (
                <li key={entry.id} className="flex flex-col">
                  <time dateTime={entry.iso} className="muted mono">
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
