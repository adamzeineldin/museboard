"use client";

import { useActionState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { saveProfile } from "./actions";
import { fieldValues, INITIAL_ONBOARDING_STATE, withBrowserTimeZone, type ProfileFormValues } from "./form-state";
import { OnboardingFields } from "./OnboardingFields";

export interface OnboardingFormProps {
  defaults: ProfileFormValues;
  /** True when the stored time zone is just the schema default, so the browser's zone should win. */
  useBrowserTimeZone: boolean;
  timeZones: string[];
  gradYears: number[];
}

const noSubscription = () => () => {};
const readBrowserTimeZone = (): string | null => Intl.DateTimeFormat().resolvedOptions().timeZone || null;
const noBrowserTimeZone = (): string | null => null;

export function OnboardingForm({ defaults, useBrowserTimeZone, timeZones, gradYears }: OnboardingFormProps) {
  const [state, action, pending] = useActionState(saveProfile, INITIAL_ONBOARDING_STATE);
  const tzRef = useRef<HTMLSelectElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Null on the server and during hydration, then the browser's zone. Added as an option when the list spells it differently.
  const detectedZone = useSyncExternalStore(noSubscription, readBrowserTimeZone, noBrowserTimeZone);
  const browserZone = useBrowserTimeZone ? detectedZone : null;
  const zones = useMemo(() => withBrowserTimeZone(timeZones, browserZone), [timeZones, browserZone]);

  useEffect(() => {
    if (browserZone && tzRef.current) tzRef.current.value = browserZone;
  }, [browserZone]);

  // After a failed submit, move focus to the first field that needs fixing so its error is read out.
  useEffect(() => {
    if (Object.keys(state.fieldErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  // React resets a form after its action runs. Remounting with the echoed values keeps what the user typed
  // (selects ignore defaultValue changes, so a plain re-render would snap the time zone back).
  const formKey = state.values ? JSON.stringify(state.values) : "initial";
  return (
    <form key={formKey} ref={formRef} action={action} noValidate>
      <div className="form-panel">
        <OnboardingFields
          values={fieldValues(state, defaults)}
          errors={state.fieldErrors}
          timeZones={zones}
          gradYears={gradYears}
          timeZoneRef={tzRef}
        />
      </div>
      {state.formError ? (
        <p className="banner hold" role="alert">
          {state.formError}
        </p>
      ) : null}
      <div className="cta-row">
        <Button type="submit" variant="primary" className="cta" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </Button>
        <span className="muted text-[13px]">You can change these anytime in Settings.</span>
      </div>
    </form>
  );
}
