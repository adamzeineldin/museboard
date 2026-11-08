export interface VersionHistoryRow {
  id: string;
  number: number;
  /** e.g. "In force", "Pending", "Replaced". */
  stateLabel: string;
  /** e.g. "Approved Nov 7, 2:14 PM on the web" or "Proposed by Muse Nov 8, 9:00 AM". */
  detail: string;
}

/** Collapsed list of every version of the campaign. */
export function VersionHistory({ rows }: { rows: VersionHistoryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <details className="panel">
      <summary className="cursor-pointer font-bold">Version history ({rows.length})</summary>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-2 text-sm">
            <b>Version {row.number}</b>
            <span className="chip neutral">{row.stateLabel}</span>
            <span className="muted">{row.detail}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
