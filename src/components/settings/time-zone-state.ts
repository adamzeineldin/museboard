// Pure: result of the Settings "Time zone" action.

export interface TimeZoneFormState {
  status: "idle" | "success" | "error";
  message: string;
  /** The zone the picker should show after this result (saved or just submitted), or null to show the stored one. */
  selected: string | null;
  /** Changes on every result so the picker remounts after React's post-action form reset. */
  nonce: number;
}

export const IDLE_TIME_ZONE_STATE: TimeZoneFormState = { status: "idle", message: "", selected: null, nonce: 0 };

/** The zone the picker should start on. */
export function shownTimeZone(state: TimeZoneFormState, current: string): string {
  return state.selected ?? current;
}

export const TIME_ZONE_HINT_ID = "settings-timezone-hint";
export const TIME_ZONE_ERROR_ID = "settings-timezone-error";

/** The result to show, or null. Hidden while a save is pending, so a repeated message mounts (and is announced) again. */
export function visibleResult(state: TimeZoneFormState, pending: boolean): "success" | "error" | null {
  if (pending || state.status === "idle") return null;
  return state.status;
}

/** aria-invalid and aria-describedby for the picker: the hint always, plus the error while it is shown. */
export function timeZoneSelectA11y(state: TimeZoneFormState, pending: boolean) {
  const invalid = visibleResult(state, pending) === "error";
  return {
    "aria-invalid": invalid ? true : undefined,
    "aria-describedby": invalid ? `${TIME_ZONE_HINT_ID} ${TIME_ZONE_ERROR_ID}` : TIME_ZONE_HINT_ID,
  };
}
