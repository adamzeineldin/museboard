"use client";

import { useMemo, useState, useTransition } from "react";
import type { CampaignRules, JobType } from "@/lib/types";
import { approveRulesAction, saveRulesAction, setCampaignStatusAction, type CampaignActionResult } from "@/app/(app)/campaign/actions";
import { ConsentPanel } from "./ConsentPanel";
import { approveState, cycleCompany, draftToRules, initialDraft, toggleRole, type CampaignDraft } from "./form-model";
import { RevokeDialog } from "./RevokeDialog";
import { RulesFields } from "./RulesFields";
import { Toast, useToast } from "./Toast";

export interface CampaignFormProps {
  companies: string[];
  resumes: Array<{ id: string; filename: string }>;
  inForce: CampaignRules | null;
  pending: CampaignRules | null;
  pendingNote: string | null;
  status: "active" | "paused" | null;
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
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const toast = useToast();

  const result = useMemo(() => draftToRules(draft), [draft]);
  const state = approveState(draft, { inForce: props.inForce, pending: props.pending, minEndsOn: props.minEndsOn });
  const errors = result.ok ? {} : result.errors;
  const resumeName = props.resumes.find((resume) => resume.id === draft.resumeId)?.filename ?? "";
  const summaryRules = {
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
  const withRules = (action: (rules: CampaignRules) => Promise<CampaignActionResult>) => () => {
    if (result.ok) run(() => action(result.rules));
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
          canSave={state.canSave}
          busy={busy}
          onApprove={withRules(approveRulesAction)}
          onSave={withRules(saveRulesAction)}
          onTogglePause={() => run(() => setCampaignStatusAction(props.status === "paused" ? "active" : "paused"))}
          onRevoke={() => setRevokeOpen(true)}
        />
      </div>
      <RevokeDialog
        open={revokeOpen}
        busy={busy}
        onCancel={() => setRevokeOpen(false)}
        onConfirm={() => run(() => setCampaignStatusAction("revoked"), () => setRevokeOpen(false))}
      />
      <Toast message={toast.message} tone={toast.tone} />
    </>
  );
}
