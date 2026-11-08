import { isoWeekRange, isValidTimeZone, localDateString } from "@/lib/rules";

// The week a digest reports on: the most recent ISO week (Monday 00:00 to the next Monday 00:00 in the
// user's time zone) that has ended at or before `now`. The worker sends on Monday, so this is the week
// that just finished; a manual run mid-week reports the last full week, never a partial one, so two
// digests never cover the same applications twice.

export interface DigestWeek {
  /** Inclusive instant: Monday 00:00 local. */
  start: Date;
  /** Exclusive instant: the following Monday 00:00 local. */
  end: Date;
  /** Local calendar days, YYYY-MM-DD. */
  firstDay: string;
  lastDay: string;
  timeZone: string;
}

export const FALLBACK_TIME_ZONE = "UTC";

/** The user's zone when it is a real IANA zone, otherwise UTC (so a bad profile value can't break the digest). */
export function safeTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
}

export function digestWeek(now: Date, timeZone: string): DigestWeek {
  const zone = safeTimeZone(timeZone);
  const current = isoWeekRange(now, zone);
  const { start, end } = isoWeekRange(new Date(current.start.getTime() - 1), zone);
  return {
    start,
    end,
    firstDay: localDateString(start, zone),
    lastDay: localDateString(new Date(end.getTime() - 1), zone),
    timeZone: zone,
  };
}
