import { z } from "zod";

export const GRAD_YEAR_MIN = 2000;
export const GRAD_YEAR_MAX = 2040;

/** The runtime's canonical name for a zone ("america/new_york" -> "America/New_York"), or null if Intl rejects it. */
export function canonicalTimeZone(timeZone: string): string | null {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  return canonicalTimeZone(timeZone) !== null;
}

/** The schema default for User.timezone, so a new user's zone is really "not chosen yet". */
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * One zone from a form, canonicalised, and only if the pickers offer it (so offset zones like "+05:00" are out).
 * `current` is the user's stored zone, which the picker lists even when the runtime does not.
 */
export function timeZoneSchemaFor(current: string) {
  return z
    .string()
    .trim()
    .transform((zone) => canonicalTimeZone(zone) ?? zone)
    .refine((zone) => supportedTimeZones(current).includes(zone), "Pick a valid time zone");
}

/** Onboarding and Settings share this; Settings builds one with the stored zone via timeZoneSchemaFor. */
export const timeZoneSchema = timeZoneSchemaFor(DEFAULT_TIME_ZONE);

/** Zones offered in the time zone pickers: the runtime's IANA list, plus UTC and the user's stored zone if missing. */
export function supportedTimeZones(current: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  const withDefault = zones.includes(DEFAULT_TIME_ZONE) ? zones : [DEFAULT_TIME_ZONE, ...zones];
  return withDefault.includes(current) ? withDefault : [current, ...withDefault];
}

/** "America/New_York" -> "America/New York" for display. */
export function timeZoneLabel(zone: string): string {
  return zone.replace(/_/g, " ");
}

/**
 * Onboarding form input. Accepts FormData strings and coerces gradYear.
 * `current` is the user's stored zone, so the schema accepts every zone the picker offers.
 */
export function profileSchemaFor(current: string) {
  return z.object({
    name: z.string().trim().min(1, "Tell us your name").max(100),
    school: z.string().trim().min(1, "Add your school").max(200),
    gradYear: z.coerce.number().int().min(GRAD_YEAR_MIN, "Check your graduation year").max(GRAD_YEAR_MAX, "Check your graduation year"),
    timezone: timeZoneSchemaFor(current),
  });
}

export const profileSchema = profileSchemaFor(DEFAULT_TIME_ZONE);

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
