"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { saveProfile, type OnboardingState } from "./actions";

export interface OnboardingFormProps {
  defaults: { name: string; school: string; gradYear: string; timezone: string };
  /** True when the stored time zone is just the schema default, so the browser's zone should win. */
  useBrowserTimeZone: boolean;
  timeZones: string[];
  gradYears: number[];
}

const INITIAL: OnboardingState = { fieldErrors: {}, formError: null };

export function OnboardingForm({ defaults, useBrowserTimeZone, timeZones, gradYears }: OnboardingFormProps) {
  const [state, action, pending] = useActionState(saveProfile, INITIAL);
  const tzRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!useBrowserTimeZone || !tzRef.current) return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone && timeZones.includes(browserZone)) tzRef.current.value = browserZone;
  }, [useBrowserTimeZone, timeZones]);

  const err = state.fieldErrors;
  return (
    <form action={action} noValidate>
      <label className="field">
        <span className="label">Your name</span>
        <input name="name" autoComplete="name" required defaultValue={defaults.name} aria-invalid={err.name ? true : undefined} />
        {err.name ? <span className="error">{err.name}</span> : null}
      </label>
      <label className="field">
        <span className="label">School</span>
        <input name="school" autoComplete="organization" required defaultValue={defaults.school} aria-invalid={err.school ? true : undefined} />
        {err.school ? <span className="error">{err.school}</span> : null}
      </label>
      <label className="field">
        <span className="label">Graduation year</span>
        <select name="gradYear" required defaultValue={defaults.gradYear} aria-invalid={err.gradYear ? true : undefined}>
          <option value="" disabled>
            Pick a year
          </option>
          {gradYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        {err.gradYear ? <span className="error">{err.gradYear}</span> : null}
      </label>
      <label className="field">
        <span className="label">Time zone</span>
        <select ref={tzRef} name="timezone" required defaultValue={defaults.timezone} aria-invalid={err.timezone ? true : undefined}>
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="hint">Weekly limits reset Monday at midnight in this time zone.</span>
        {err.timezone ? <span className="error">{err.timezone}</span> : null}
      </label>
      {state.formError ? (
        <p className="banner hold" role="alert">
          {state.formError}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
