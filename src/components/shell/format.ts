/** "2026-12-15" -> "Dec 15" (the date is a calendar day, so format it in UTC to avoid shifting). */
export function formatShortDate(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "2026-12-15" -> "Dec 15, 2026". Used wherever the year matters, e.g. the consent summary's end date. */
export function formatLongDate(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative time for activity feeds: "just now", "5 min ago", "3 hours ago", "2 days ago". */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(diff / DAY);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
