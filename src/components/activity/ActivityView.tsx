"use client";

import { useTransition } from "react";
import {
  approveApplicationAction,
  markSubmittedAction,
  runWeeklyPassAction,
  skipApplicationAction,
  type ActivityActionResult,
} from "@/app/(app)/activity/actions";
import { Button, EmptyState } from "@/components/ui";
import { Toast, useToast } from "../campaign/Toast";
import { ActivityRow } from "./ActivityRow";
import type { ActivityRowModel } from "./rows";
import { statsModel, type StatsLike } from "./view-model";

export interface ActivityViewProps {
  rows: ActivityRowModel[];
  stats: StatsLike;
  campaignActive: boolean;
}

export function ActivityView({ rows, stats, campaignActive }: ActivityViewProps) {
  const [busy, startTransition] = useTransition();
  const toast = useToast();

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
        <span id="pass-hint" className="muted text-[.82rem]">
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
        <EmptyState>Nothing yet. Approve a campaign, then ask Muse to run this week&apos;s pass.</EmptyState>
      ) : (
        <ul className="list m-0 list-none p-0" aria-label="Applications">
          {rows.map((row) => (
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
      <Toast message={toast.message} tone={toast.tone} />
    </>
  );
}
