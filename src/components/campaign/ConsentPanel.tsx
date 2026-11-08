"use client";

import type { Ref } from "react";
import { Button, Chip } from "@/components/ui";
import type { SummaryRules } from "@/lib/campaign/summary";
import { RulesSummary } from "./RulesSummary";

export const CHANGED_BANNER = "You changed the rules. Inroad keeps using the version you approved until you approve this one.";

export interface ConsentPanelProps {
  rules: SummaryRules;
  resumeName: string;
  /** "ended": active, but the end date of the rules in force has passed (in the user's zone). */
  status: "active" | "paused" | "ended" | null;
  approvedLabel: string | null;
  pendingNote: string | null;
  changed: boolean;
  approveLabel: string;
  canApprove: boolean;
  /** Why Approve is unavailable, shown under the buttons and linked to Approve. */
  approveReasons: string[];
  canSave: boolean;
  busy: boolean;
  /** Posted as a hidden input: the pending version whose summary is shown ("" when none is stored). */
  approveVersionId: string;
  /** Posted as a hidden input: JSON of the rules the summary above was computed from. */
  approveRules: string;
  onApprove: (formData: FormData) => void;
  onSave: () => void;
  onTogglePause: () => void;
  onRevoke: () => void;
  /** The campaign state row; focused after a revoke removes the Revoke button that opened the dialog. */
  stateRef?: Ref<HTMLDivElement>;
}

function StateChip({ status }: { status: ConsentPanelProps["status"] }) {
  if (status === "active") return <Chip tone="ok">Active</Chip>;
  if (status === "paused") return <Chip tone="hold">Paused</Chip>;
  if (status === "ended") return <Chip tone="neutral">Ended</Chip>;
  return <Chip tone="neutral">Not approved</Chip>;
}

const REASONS_ID = "approve-reasons";

function StatusButtons({ status, busy, onTogglePause, onRevoke }: Pick<ConsentPanelProps, "status" | "busy" | "onTogglePause" | "onRevoke">) {
  if (!status) return null;
  return (
    <>
      {status === "ended" ? null : (
        <Button onClick={onTogglePause} disabled={busy}>
          {status === "paused" ? "Resume" : "Pause"}
        </Button>
      )}
      <Button onClick={onRevoke} disabled={busy}>
        Revoke
      </Button>
    </>
  );
}

/** Right panel: the live "What you're approving" summary and the consent controls. */
export function ConsentPanel({ stateRef, ...props }: ConsentPanelProps) {
  const { status, busy } = props;
  const reasons = props.canApprove ? [] : props.approveReasons;
  return (
    <section className="consent" aria-labelledby="approving-label">
      <span id="approving-label" className="label">
        What you&apos;re approving
      </span>
      <RulesSummary rules={props.rules} resumeName={props.resumeName} />
      {props.pendingNote ? <div className="banner">{props.pendingNote}</div> : null}
      {props.changed ? (
        <div className="banner" role="note">
          {CHANGED_BANNER}
        </div>
      ) : null}
      <div className="state" ref={stateRef} tabIndex={-1}>
        <StateChip status={status} />
        {props.approvedLabel ? <span className="muted text-[.82rem]">{props.approvedLabel}</span> : null}
      </div>
      <form
        className="actions"
        onSubmit={(event) => {
          event.preventDefault();
          if (props.canApprove && !busy) props.onApprove(new FormData(event.currentTarget));
        }}
      >
        <input type="hidden" name="versionId" value={props.approveVersionId} />
        <input type="hidden" name="rules" value={props.approveRules} />
        {/* aria-disabled keeps Approve focusable, so its reasons can be read; the submit handler ignores it. */}
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          aria-disabled={!props.canApprove || undefined}
          aria-describedby={reasons.length > 0 ? REASONS_ID : undefined}
        >
          {props.approveLabel}
        </Button>
        <Button onClick={props.onSave} disabled={!props.canSave || busy}>
          Save without approving
        </Button>
        <StatusButtons status={status} busy={busy} onTogglePause={props.onTogglePause} onRevoke={props.onRevoke} />
      </form>
      {reasons.length > 0 ? (
        <div id={REASONS_ID} className="muted flex flex-col gap-1 text-[.82rem]">
          {reasons.map((reason) => (
            <p key={reason} className="m-0">
              {reason}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
