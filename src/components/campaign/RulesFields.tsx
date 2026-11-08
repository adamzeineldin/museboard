"use client";

import Link from "next/link";
import { MIN_MATCH_MAX, MIN_MATCH_MIN, WEEKLY_CAP_MAX, WEEKLY_CAP_MIN, type JobType } from "@/lib/types";
import { companyChipModel, type CampaignDraft, type DraftField } from "./form-model";

const ROLE_OPTIONS: Array<[JobType, string]> = [
  ["intern", "Internships"],
  ["newgrad", "New grad"],
];

export interface RulesFieldsProps {
  draft: CampaignDraft;
  companies: string[];
  resumes: Array<{ id: string; filename: string }>;
  minEndsOn: string;
  errors: Partial<Record<DraftField, string>>;
  onToggleRole: (role: JobType) => void;
  onCycleCompany: (name: string) => void;
  onChange: (field: "resumeId" | "weeklyCap" | "minMatch" | "endsOn", value: string) => void;
  onClamp: (field: "weeklyCap" | "minMatch") => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span id={id} className="error">
      {message}
    </span>
  ) : null;
}

function ResumeField({ draft, resumes, error, onChange }: Pick<RulesFieldsProps, "draft" | "resumes" | "onChange"> & { error?: string }) {
  if (resumes.length === 0) {
    return (
      <div className="field">
        <span className="label">Resume</span>
        <span className="hint">
          Upload a resume first. <Link href="/settings">Go to Settings</Link>
        </span>
      </div>
    );
  }
  return (
    <label className="field">
      <span className="label">Resume</span>
      <select
        value={draft.resumeId}
        onChange={(event) => onChange("resumeId", event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "resume-error" : undefined}
      >
        <option value="" disabled>
          Pick a resume
        </option>
        {resumes.map((resume) => (
          <option key={resume.id} value={resume.id}>
            {resume.filename}
          </option>
        ))}
      </select>
      <FieldError id="resume-error" message={error} />
    </label>
  );
}

interface NumberFieldProps {
  field: "weeklyCap" | "minMatch";
  label: string;
  min: number;
  max: number;
  value: string;
  error?: string;
  onChange: RulesFieldsProps["onChange"];
  onClamp: RulesFieldsProps["onClamp"];
}

function NumberField({ field, label, min, max, value, error, onChange, onClamp }: NumberFieldProps) {
  const errorId = `${field}-error`;
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
        onBlur={() => onClamp(field)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <FieldError id={errorId} message={error} />
    </label>
  );
}

/** Left panel of the campaign page: the editable rules. */
export function RulesFields(props: RulesFieldsProps) {
  const { draft, companies, errors, minEndsOn, onToggleRole, onCycleCompany, onChange, onClamp } = props;
  return (
    <section className="panel" aria-label="Campaign rules">
      <fieldset className="field m-0 border-0 p-0" aria-describedby={errors.roles ? "roles-error" : undefined}>
        <legend className="label mb-2">Role types</legend>
        <div className="opts">
          {ROLE_OPTIONS.map(([role, label]) => (
            <button key={role} type="button" className="toggle" aria-pressed={draft.roles.includes(role)} onClick={() => onToggleRole(role)}>
              {label}
            </button>
          ))}
        </div>
        <FieldError id="roles-error" message={errors.roles} />
      </fieldset>

      <fieldset className="field m-0 border-0 p-0" aria-describedby="companies-hint">
        <legend className="label mb-2">Companies</legend>
        <span id="companies-hint" className="hint">
          Tap to cycle: auto-apply, ask me first, skip.
        </span>
        {companies.length === 0 ? (
          <span className="hint">No companies have open roles yet. Check back after the next job refresh.</span>
        ) : (
          <div className="opts">
            {companies.map((name) => {
              const chip = companyChipModel(draft, name);
              return (
                <button key={name} type="button" className="co" data-s={chip.state} aria-describedby="companies-hint" onClick={() => onCycleCompany(name)}>
                  {name}
                  <em aria-hidden="true">{chip.label}</em>
                  <span className="sr-only">: {chip.spoken}</span>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="inline-fields">
        <ResumeField draft={draft} resumes={props.resumes} error={errors.resumeId} onChange={onChange} />
        <NumberField field="weeklyCap" label="Per week, max" min={WEEKLY_CAP_MIN} max={WEEKLY_CAP_MAX} value={draft.weeklyCap} error={errors.weeklyCap} onChange={onChange} onClamp={onClamp} />
        <NumberField field="minMatch" label="Min match %" min={MIN_MATCH_MIN} max={MIN_MATCH_MAX} value={draft.minMatch} error={errors.minMatch} onChange={onChange} onClamp={onClamp} />
      </div>

      <label className="field">
        <span className="label">Campaign ends</span>
        <input
          type="date"
          min={minEndsOn}
          value={draft.endsOn}
          onChange={(event) => onChange("endsOn", event.target.value)}
          className="max-w-[200px]"
          aria-invalid={errors.endsOn ? true : undefined}
          aria-describedby={errors.endsOn ? "endsOn-error" : undefined}
        />
        <FieldError id="endsOn-error" message={errors.endsOn} />
      </label>
    </section>
  );
}
