import type { Ref } from "react";
import { timeZoneLabel } from "@/lib/profile";
import { fieldErrorId, type OnboardingState, type ProfileField, type ProfileFormValues } from "./form-state";

export interface OnboardingFieldsProps {
  values: ProfileFormValues;
  errors: OnboardingState["fieldErrors"];
  timeZones: string[];
  gradYears: number[];
  timeZoneRef?: Ref<HTMLSelectElement>;
}

const TIMEZONE_HINT_ID = "onboarding-timezone-hint";

/** aria-invalid plus aria-describedby pointing at the error (and any hint) for one field. */
function errorProps(field: ProfileField, errors: OnboardingState["fieldErrors"], hintId?: string) {
  const ids = [hintId, errors[field] ? fieldErrorId(field) : undefined].filter(Boolean).join(" ");
  return { "aria-invalid": errors[field] ? true : undefined, "aria-describedby": ids || undefined };
}

function FieldError({ field, errors }: { field: ProfileField; errors: OnboardingState["fieldErrors"] }) {
  const message = errors[field];
  return message ? (
    <span className="error" id={fieldErrorId(field)}>
      {message}
    </span>
  ) : null;
}

/** The four onboarding inputs. Uncontrolled: the parent remounts them (via key) to show echoed values. */
export function OnboardingFields({ values, errors, timeZones, gradYears, timeZoneRef }: OnboardingFieldsProps) {
  return (
    <>
      <label className="field">
        <span className="label">Your name</span>
        <input name="name" autoComplete="name" required defaultValue={values.name} {...errorProps("name", errors)} />
        <FieldError field="name" errors={errors} />
      </label>
      <label className="field">
        <span className="label">School</span>
        <input name="school" autoComplete="organization" required defaultValue={values.school} {...errorProps("school", errors)} />
        <FieldError field="school" errors={errors} />
      </label>
      <label className="field">
        <span className="label">Graduation year</span>
        <select name="gradYear" required defaultValue={values.gradYear} {...errorProps("gradYear", errors)}>
          <option value="" disabled>
            Pick a year
          </option>
          {gradYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <FieldError field="gradYear" errors={errors} />
      </label>
      <label className="field">
        <span className="label">Time zone</span>
        <select
          ref={timeZoneRef}
          name="timezone"
          required
          defaultValue={values.timezone}
          {...errorProps("timezone", errors, TIMEZONE_HINT_ID)}
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {timeZoneLabel(zone)}
            </option>
          ))}
        </select>
        <span className="hint" id={TIMEZONE_HINT_ID}>
          Weekly limits reset Monday at midnight in this time zone.
        </span>
        <FieldError field="timezone" errors={errors} />
      </label>
    </>
  );
}
