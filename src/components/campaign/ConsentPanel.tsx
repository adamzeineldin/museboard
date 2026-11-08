"use client";

import { Button, Chip } from "@/components/ui";
import type { SummaryRules } from "@/lib/campaign/summary";
import { RulesSummary } from "./RulesSummary";

export const CHANGED_BANNER = "You changed the rules. Inroad keeps using the version you approved until you approve this one.";

export interface ConsentPanelProps {
  rules: SummaryRules;
  resumeName: string;
  status: "active" | "paused" | null;
  approvedLabel: string | null;
  pendingNote: string | null;
  changed: boolean;
  approveLabel: string;
  canApprove: boolean;
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
}

function StateChip({ status }: { status: ConsentPanelProps["status"] }) {
  if (status === "active") return <Chip tone="ok">Active</Chip>;
  if (status === "paused") return <Chip tone="hold">Paused</Chip>;
  return <Chip tone="neutral">Not approved</Chip>;
}

/** Right panel: the live "What you're approving" summary and the consent controls. */
export function ConsentPanel(props: ConsentPanelProps) {
  const { status, busy } = props;
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
      <div className="state">
        <StateChip status={status} />
        {props.approvedLabel ? <span className="muted text-[.82rem]">{props.approvedLabel}</span> : null}
      </div>
      <form
        className="actions"
        onSubmit={(event) => {
          event.preventDefault();
          props.onApprove(new FormData(event.currentTarget));
        }}
      >
        <input type="hidden" name="versionId" value={props.approveVersionId} />
        <input type="hidden" name="rules" value={props.approveRules} />
        <Button type="submit" variant="primary" disabled={!props.canApprove || busy}>
          {props.approveLabel}
        </Button>
        <Button onClick={props.onSave} disabled={!props.canSave || busy}>
          Save without approving
        </Button>
        {status ? (
          <>
            <Button onClick={props.onTogglePause} disabled={busy}>
              {status === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button onClick={props.onRevoke} disabled={busy}>
              Revoke
            </Button>
          </>
        ) : null}
      </form>
    </section>
  );
}
