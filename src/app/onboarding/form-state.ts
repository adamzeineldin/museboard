// Pure: the onboarding form's action state and helpers shared by the action and the form.

export type ProfileField = "name" | "school" | "gradYear" | "timezone";

export const PROFILE_FIELDS: readonly ProfileField[] = ["name", "school", "gradYear", "timezone"];

/** The raw form strings, echoed back on failure so the form can show what the user typed. */
export type ProfileFormValues = Readonly<Record<ProfileField, string>>;

export interface OnboardingState {
  fieldErrors: Partial<Record<ProfileField, string>>;
  formError: string | null;
  /** What was submitted, or null before the first submit. */
  values: ProfileFormValues | null;
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = { fieldErrors: {}, formError: null, values: null };

const isProfileField = (key: unknown): key is ProfileField => PROFILE_FIELDS.includes(key as ProfileField);

/** Read the four fields as strings. Anything missing or not text (a crafted file part) becomes "". */
export function readProfileForm(formData: FormData): ProfileFormValues {
  const text = (field: ProfileField): string => {
    const value = formData.get(field);
    return typeof value === "string" ? value : "";
  };
  return { name: text("name"), school: text("school"), gradYear: text("gradYear"), timezone: text("timezone") };
}

/** First message per field from a zod issue list. */
export function profileFieldErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): OnboardingState["fieldErrors"] {
  return issues.reduce<OnboardingState["fieldErrors"]>((errors, issue) => {
    const key = issue.path[0];
    return isProfileField(key) && !errors[key] ? { ...errors, [key]: issue.message } : errors;
  }, {});
}

/** The values the fields should show: the last submission if there was one, else the server defaults. */
export function fieldValues(state: OnboardingState, defaults: ProfileFormValues): ProfileFormValues {
  return state.values ?? defaults;
}

/** DOM id of a field's error message, for aria-describedby. */
export const fieldErrorId = (field: ProfileField): string => `onboarding-${field}-error`;

/**
 * The picker list plus the browser's zone when the runtime lists it under another name
 * (Firefox and Safari report Asia/Kolkata where the list has Asia/Calcutta). The server canonicalises it on submit.
 */
export function withBrowserTimeZone(zones: string[], browserZone: string | null): string[] {
  return !browserZone || zones.includes(browserZone) ? zones : [browserZone, ...zones];
}
