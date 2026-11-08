"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import type { CampaignRules, JobType } from "@/lib/types";
import { approveRulesAction, saveRulesAction, setCampaignStatusAction, type CampaignActionResult } from "@/app/(app)/campaign/actions";
import { ConsentPanel } from "./ConsentPanel";
import { approveState, cycleCompany, draftErrors, draftToRules, initialDraft, toggleRole, type CampaignDraft } from "./form-model";
import { RevokeDialog } from "./RevokeDialog";
import { RulesFields } from "./RulesFields";
import { Toast, useToast } from "./Toast";

export interface CampaignFormProps {
  companies: string[];
  resumes: Array<{ id: string; filename: string }>;
  inForce: CampaignRules | null;
  pending: CampaignRules | null;
  /** Id of the stored pending version (its rules are `pending`), or null. Posted with Approve. */
  pendingVersionId: string | null;
  pendingNote: string | null;
  status: "active" | "paused" | "ended" | null;
  approvedLabel: string | null;
  defaults: { resumeId: string; endsOn: string };
  minEndsOn: string;
}

const RANGES = { weeklyCap: [1, 20], minMatch: [50, 100] } as const;

function clamp(value: string, [min, max]: readonly [number, number]): string {
  const n = Number(value);
  if (value.trim() === "" || Number.isNaN(n)) return value;
  return String(Math.min(max, Math.max(min, Math.round(n))));
}

export function CampaignForm(props: CampaignFormProps) {
  const [draft, setDraft] = useState<CampaignDraft>(() =>
    initialDraft({ pending: props.pending, inForce: props.inForce, defaults: props.defaults }),
  );
  // When the stored pending version changes (after a save, an approval, or a refused stale approval that
  // refreshed the page), show its rules, so the summary on screen is always the version Approve posts.
  const [shownVersionId, setShownVersionId] = useState(props.pendingVersionId);
  if (shownVersionId !== props.pendingVersionId) {
    setShownVersionId(props.pendingVersionId);
    setDraft(initialDraft({ pending: props.pending, inForce: props.inForce, defaults: props.defaults }));
  }
  const [revokeOpen, setRevokeOpen] = useState(false);
  // After a revoke the Revoke button that opened the dialog is gone, so focus moves to the state row instead.
  // Set only when the revoke succeeds while the dialog is open; cleared whenever the dialog opens or is cancelled.
  const revoked = useRef(false);
  const stateRef = useRef<HTMLDivElement>(null);
  const onRevokeClosed = useCallback(() => {
    if (!revoked.current) return;
    revoked.current = false;
    stateRef.current?.focus();
  }, []);
  const [busy, startTransition] = useTransition();
  const toast = useToast();

  const result = useMemo(() => draftToRules(draft), [draft]);
  const state = approveState(draft, { inForce: props.inForce, pending: props.pending, minEndsOn: props.minEndsOn });
  const errors = useMemo(() => draftErrors(draft, props.minEndsOn), [draft, props.minEndsOn]);
  const resumeName = props.resumes.find((resume) => resume.id === draft.resumeId)?.filename ?? "";
  // The summary is computed from exactly the rules Approve and Save send; the raw draft is only a fallback
  // while the form is invalid (and then Approve is disabled).
  const summaryRules = result.ok
    ? result.rules
    : {
        roles: draft.roles,
        autoCompanies: draft.auto,
        askFirstCompanies: draft.ask,
        weeklyCap: Number(draft.weeklyCap) || 0,
        minMatch: Number(draft.minMatch) || 0,
        endsOn: draft.endsOn,
      };

  const run = (action: () => Promise<CampaignActionResult>, after?: () => void) =>
    startTransition(async () => {
      try {
        const outcome = await action();
        toast.show(outcome.message, outcome.ok ? "ok" : "error");
        if (outcome.ok) after?.();
      } catch {
        toast.show("We couldn't reach Inroad. Check your connection and try again.", "error");
      }
    });
  const onSave = () => {
    if (result.ok) run(() => saveRulesAction(result.rules));
  };
  const onApprove = (formData: FormData) => {
    if (result.ok && state.canApprove) run(() => approveRulesAction(formData));
  };

  return (
    <>
      <div className="camp">
        <RulesFields
          draft={draft}
          companies={props.companies}
          resumes={props.resumes}
          minEndsOn={props.minEndsOn}
          errors={errors}
          onToggleRole={(role: JobType) => setDraft((d) => toggleRole(d, role))}
          onCycleCompany={(name) => setDraft((d) => cycleCompany(d, name, props.companies))}
          onChange={(field, value) => setDraft((d) => ({ ...d, [field]: value }))}
          onClamp={(field) => setDraft((d) => ({ ...d, [field]: clamp(d[field], RANGES[field]) }))}
        />
        <ConsentPanel
          rules={summaryRules}
          resumeName={resumeName}
          status={props.status}
          approvedLabel={props.approvedLabel}
          pendingNote={props.pendingNote}
          changed={state.changed}
          approveLabel={state.label}
          canApprove={state.canApprove}
          approveReasons={state.reasons}
          canSave={state.canSave}
          busy={busy}
          approveVersionId={props.pendingVersionId ?? ""}
          approveRules={result.ok ? JSON.stringify(result.rules) : ""}
          onApprove={onApprove}
          onSave={onSave}
          onTogglePause={() => run(() => setCampaignStatusAction(props.status === "paused" ? "active" : "paused"))}
          onRevoke={() => {
            revoked.current = false;
            setRevokeOpen(true);
          }}
          stateRef={stateRef}
        />
      </div>
      <RevokeDialog
        open={revokeOpen}
        busy={busy}
        onCancel={() => {
          // While the revoke is in flight the dialog stays open, so its outcome is never lost.
          if (busy) return;
          revoked.current = false;
          setRevokeOpen(false);
        }}
        onConfirm={() =>
          run(
            () => setCampaignStatusAction("revoked"),
            () => {
              revoked.current = true;
              setRevokeOpen(false);
            },
          )
        }
        onClosed={onRevokeClosed}
      />
      <Toast message={toast.message} tone={toast.tone} />
    </>
  );
}
