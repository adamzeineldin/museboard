import { z } from "zod";

export const GRAD_YEAR_MIN = 2000;
export const GRAD_YEAR_MAX = 2040;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Onboarding / settings form input. Accepts FormData strings and coerces gradYear. */
export const profileSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(100),
  school: z.string().trim().min(1, "Add your school").max(200),
  gradYear: z.coerce.number().int().min(GRAD_YEAR_MIN, "Check your graduation year").max(GRAD_YEAR_MAX, "Check your graduation year"),
  timezone: z.string().trim().refine(isValidTimeZone, "Pick a valid time zone"),
});

export type ProfileInput = z.output<typeof profileSchema>;

export interface ProfileFields {
  name: string | null;
  school: string | null;
  gradYear: number | null;
}

/** New users land on /onboarding until these are filled in. */
export function isProfileComplete(user: ProfileFields): boolean {
  return Boolean(user.name?.trim() && user.school?.trim() && user.gradYear);
}
