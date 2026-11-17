"use client";

import { useState, useTransition } from "react";
import {
  approveApplicationAction,
  markSubmittedAction,
  runWeeklyPassAction,
  skipApplicationAction,
  type ActivityActionResult,
} from "@/app/(app)/activity/actions";
import { Button, ButtonLink, EmptyState, Pill } from "@/components/ui";
import { Toast, useToast } from "../campaign/Toast";
import { ActivityRow } from "./ActivityRow";
import { boardColumns, defaultFilter, type BoardColumnKey } from "./board";
import type { ActivityRowModel } from "./rows";
import { emptyActivityCopy, hiddenHistoryNote, statsModel, type StatsLike } from "./view-model";

export interface ActivityViewProps {
  rows: ActivityRowModel[];
  stats: StatsLike;
  campaignActive: boolean;
  /** Older submitted/skipped applications not listed (the stats still count them). */
  hiddenHistory?: number;
}

export function ActivityView({ rows, stats, campaignActive, hiddenHistory = 0 }: ActivityViewProps) {
  const [busy, startTransition] = useTransition();
  const toast = useToast();
  const columns = boardColumns(rows);
  // Phones show one column at a time; the pills pick it. Desktop shows the whole board and hides the pills.
  const [filter, setFilter] = useState<BoardColumnKey>(() => defaultFilter(columns));

  const run = (action: () => Promise<ActivityActionResult>) =>
    startTransition(async () => {
      try {
        const outcome = await action();
        toast.show(outcome.message, outcome.ok ? "ok" : "error");
      } catch {
        toast.show("We couldn't reach Inroad. Check your connection and try again.", "error");
      }
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => run(runWeeklyPassAction)} disabled={busy || !campaignActive} aria-describedby="pass-hint">
          {busy ? "Working…" : "Run this week's pass"}
        </Button>
        <span id="pass-hint" className="muted text-[13px]">
          {campaignActive
            ? "Checks new matches against your approved rules. Nothing is submitted without a packet check."
            : "Approve or resume a campaign to run a pass."}
        </span>
      </div>
      <div className="stats">
        {statsModel(stats).map((stat) => (
          <div key={stat.label} className="stat">
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="Muse is waiting for matching jobs"
          action={
            campaignActive ? null : (
              <ButtonLink href="/campaign" variant="primary" size="small">
                Go to rules
              </ButtonLink>
            )
          }
        >
          {emptyActivityCopy(campaignActive)}
        </EmptyState>
      ) : (
        <>
          <div className="board-pills" role="group" aria-label="Show column">
            {columns.map((column) => (
              <Pill key={column.key} pressed={filter === column.key} onClick={() => setFilter(column.key)}>
                {column.pill} <span className="mono">{column.rows.length}</span>
              </Pill>
            ))}
          </div>
          <section className="board" data-filter={filter} aria-label="Applications">
            {columns.map((column) => (
              <div key={column.key} className="board-col" data-col={column.key}>
                <h2 id={`col-${column.key}`}>
                  {column.title}
                  <span className="mono">{column.rows.length}</span>
                </h2>
                {column.rows.length === 0 ? (
                  <p className="col-empty">{column.empty}</p>
                ) : (
                  <ul aria-labelledby={`col-${column.key}`}>
                    {column.rows.map((row) => (
                      <ActivityRow
                        key={row.id}
                        row={row}
                        busy={busy}
                        onApprove={(id) => run(() => approveApplicationAction(id))}
                        onSkip={(id) => run(() => skipApplicationAction(id))}
                        onMarkSubmitted={(id) => run(() => markSubmittedAction(id))}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </>
      )}
      {hiddenHistory > 0 ? <p className="muted text-[13px]">{hiddenHistoryNote(hiddenHistory)}</p> : null}
      <Toast message={toast.message} tone={toast.tone} />
    </>
  );
}
