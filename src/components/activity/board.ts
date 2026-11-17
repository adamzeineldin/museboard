import type { ActivityRowModel } from "./rows";

// Pure: group activity rows into the Pipeline board's columns (Legwork option 1a).

export type BoardColumnKey = "waiting" | "ready" | "held" | "submitted" | "skipped";

export interface BoardColumn {
  key: BoardColumnKey;
  title: string;
  /** Short label for the phone filter pills. */
  pill: string;
  empty: string;
  rows: ActivityRowModel[];
}

const COLUMNS: ReadonlyArray<Omit<BoardColumn, "rows">> = [
  { key: "waiting", title: "Waiting on you", pill: "Waiting", empty: "Nothing needs your OK." },
  { key: "ready", title: "Ready to submit", pill: "Ready", empty: "No packets ready." },
  { key: "held", title: "Held", pill: "Held", empty: "Nothing held." },
  { key: "submitted", title: "Submitted", pill: "Sent", empty: "Nothing submitted yet." },
  { key: "skipped", title: "Skipped", pill: "Skipped", empty: "Nothing skipped." },
];

export function columnFor(row: Pick<ActivityRowModel, "status" | "held">): BoardColumnKey {
  if (row.status === "prepared") return row.held ? "held" : "ready";
  return row.status;
}

export function boardColumns(rows: readonly ActivityRowModel[]): BoardColumn[] {
  return COLUMNS.map((column) => ({ ...column, rows: rows.filter((row) => columnFor(row) === column.key) }));
}

/** The phone view opens on the first column that has something in it. */
export function defaultFilter(columns: readonly BoardColumn[]): BoardColumnKey {
  return columns.find((column) => column.rows.length > 0)?.key ?? "waiting";
}

export type StageTone = "progress" | "ok" | "hold" | "neutral";

/** The dot + label in a card's footer. */
export function stageFor(row: Pick<ActivityRowModel, "status" | "held" | "approvedByYou">): { tone: StageTone; label: string } {
  switch (columnFor(row)) {
    case "waiting":
      return { tone: "hold", label: "Waiting on you" };
    case "ready":
      return { tone: "progress", label: "Ready to submit" };
    case "held":
      return { tone: "hold", label: "Held" };
    case "submitted":
      return { tone: "ok", label: row.approvedByYou ? "Applied · approved by you" : "Applied" };
    default:
      return { tone: "neutral", label: "Skipped" };
  }
}
