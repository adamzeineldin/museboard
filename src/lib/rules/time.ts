import { isIsoCalendarDate } from "@/lib/types";

// Time-zone helpers built on Intl only. All dates are "YYYY-MM-DD" calendar dates in the given zone.

const MS_PER_SECOND = 1_000;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
// Real UTC offsets span -12h..+14h; probing 18h either side of a wall-clock midnight brackets any transition.
const OFFSET_PROBE_MS = 18 * 3_600_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    throw new RangeError(`Unknown time zone: "${timeZone}"`);
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("Expected a valid Date");
  }
}

/** The zone's wall-clock reading at `instantMs`, expressed as if it were UTC (seconds precision). */
function wallClockMs(instantMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(instantMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
}

/** UTC offset (local minus UTC) in effect at `instantMs`. */
function offsetMs(instantMs: number, timeZone: string): number {
  const flooredToSecond = Math.floor(instantMs / MS_PER_SECOND) * MS_PER_SECOND;
  return wallClockMs(instantMs, timeZone) - flooredToSecond;
}

function isoDateToUtcMs(date: string): number {
  if (!isIsoCalendarDate(date)) {
    throw new RangeError(`Expected a YYYY-MM-DD date, got "${date}"`);
  }
  return Date.parse(`${date}T00:00:00Z`);
}

const utcMsToIsoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Calendar date ("YYYY-MM-DD") of `now` in `timeZone`. */
export function localDateString(now: Date, timeZone: string): string {
  assertValidDate(now);
  return utcMsToIsoDate(wallClockMs(now.getTime(), timeZone));
}

export function addDaysToIsoDate(date: string, days: number): string {
  return utcMsToIsoDate(isoDateToUtcMs(date) + days * MS_PER_DAY);
}

/**
 * The first instant of calendar day `date` in `timeZone`. Normally local 00:00; when a DST jump skips
 * midnight, the moment the clocks jump. When midnight happens twice, the earlier one. For a day the zone
 * skipped entirely (Pacific/Apia, 2011-12-30), the first instant after it.
 */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const wall = isoDateToUtcMs(date);
  const offsets = [offsetMs(wall - OFFSET_PROBE_MS, timeZone), offsetMs(wall + OFFSET_PROBE_MS, timeZone)];
  const exact = offsets.map((offset) => wall - offset).filter((t) => wallClockMs(t, timeZone) === wall);
  if (exact.length > 0) return new Date(Math.min(...exact));
  return new Date(firstInstantAtOrAfterWall(wall, wall - Math.max(...offsets), wall - Math.min(...offsets), timeZone));
}

/** Binary search for the first instant whose wall clock is >= `wall`. Invariant: wall(low) < wall <= wall(high). */
function firstInstantAtOrAfterWall(wall: number, low: number, high: number, timeZone: string): number {
  let lo = low;
  let hi = high;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (wallClockMs(mid, timeZone) >= wall) hi = mid;
    else lo = mid;
  }
  return hi;
}

function isoWeekMonday(now: Date, timeZone: string): string {
  const today = localDateString(now, timeZone);
  const daysSinceMonday = (new Date(isoDateToUtcMs(today)).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return addDaysToIsoDate(today, -daysSinceMonday);
}

/** Instant of Monday 00:00 (local) of the ISO week containing `now` in `timeZone`. */
export function isoWeekStart(now: Date, timeZone: string): Date {
  return startOfLocalDay(isoWeekMonday(now, timeZone), timeZone);
}

export interface InstantRange {
  /** Inclusive. */
  start: Date;
  /** Exclusive: the next Monday 00:00 local. */
  end: Date;
}

/** The ISO week containing `now` in `timeZone`, as [start, end). Not always 168h long across DST. */
export function isoWeekRange(now: Date, timeZone: string): InstantRange {
  const monday = isoWeekMonday(now, timeZone);
  return {
    start: startOfLocalDay(monday, timeZone),
    end: startOfLocalDay(addDaysToIsoDate(monday, DAYS_PER_WEEK), timeZone),
  };
}
