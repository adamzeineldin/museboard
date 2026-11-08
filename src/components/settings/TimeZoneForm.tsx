"use client";

import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { timeZoneLabel } from "@/lib/profile";
import {
  IDLE_TIME_ZONE_STATE,
  shownTimeZone,
  TIME_ZONE_ERROR_ID,
  TIME_ZONE_HINT_ID,
  timeZoneSelectA11y,
  visibleResult,
  type TimeZoneFormState,
} from "./time-zone-state";

export interface TimeZoneFormProps {
  /** The stored User.timezone. */
  current: string;
  timeZones: string[];
  action: (prev: TimeZoneFormState, formData: FormData) => Promise<TimeZoneFormState>;
}

const SELECT_ID = "settings-timezone";

/** The save result. The caller keys it on state.nonce so a repeated message is a new node and is announced again. */
export function TimeZoneResult({ state, pending }: { state: TimeZoneFormState; pending: boolean }) {
  const shown = visibleResult(state, pending);
  if (shown === "error") {
    return (
      <p className="banner hold" role="alert" id={TIME_ZONE_ERROR_ID}>
        {state.message}
      </p>
    );
  }
  return shown === "success" ? (
    <p className="banner" role="status">
      {state.message}
    </p>
  ) : null;
}

/** Settings → Profile: change the time zone that sets the weekly limit window. */
export function TimeZoneForm({ current, timeZones, action }: TimeZoneFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_TIME_ZONE_STATE);
  const selectRef = useRef<HTMLSelectElement>(null);

  // After an error, put focus back on the picker (it remounts per result) so the user can fix it straight away.
  useEffect(() => {
    if (state.status === "error") selectRef.current?.focus();
  }, [state.nonce, state.status]);

  // aria-disabled instead of disabled keeps focus on the button while saving, so ignore repeat submits here.
  const ignoreWhilePending = (event: FormEvent<HTMLFormElement>) => {
    if (pending) event.preventDefault();
  };

  return (
    <form action={formAction} onSubmit={ignoreWhilePending} className="flex flex-col gap-2">
      <div className="field">
        <label htmlFor={SELECT_ID} className="label">
          Time zone
        </label>
        {/* Keyed so it remounts on each result: React resets the form after the action, and selects ignore defaultValue updates. */}
        <select
          key={state.nonce}
          ref={selectRef}
          id={SELECT_ID}
          name="timezone"
          required
          defaultValue={shownTimeZone(state, current)}
          {...timeZoneSelectA11y(state, pending)}
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {timeZoneLabel(zone)}
            </option>
          ))}
        </select>
        <span className="hint" id={TIME_ZONE_HINT_ID}>
          Your weekly limit resets every Monday at 00:00 in this time zone. Changing it takes effect right away. It moves when
          your week starts and when your campaign&apos;s end date ends.
        </span>
      </div>
      <div>
        <Button type="submit" aria-disabled={pending || undefined}>
          {pending ? "Saving…" : "Save time zone"}
        </Button>
      </div>
      <TimeZoneResult key={state.nonce} state={state} pending={pending} />
    </form>
  );
}
