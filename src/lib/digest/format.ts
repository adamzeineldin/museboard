// Pure, locale-fixed formatting for the digest (en-US, the app's language).

/** "2026-11-02" -> "Nov 2" (a calendar day, so format it at noon UTC to avoid shifting). */
export function formatIsoDay(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Mon, Nov 3" for an instant, in the user's zone. */
export function formatWeekday(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Collapse whitespace and drop control characters from scraped or user-entered text. */
export function cleanText(value: string, max = 200): string {
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape for HTML text and double- or single-quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Only absolute http(s) URLs are allowed in an email href; anything else is a bug. */
export function safeHref(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Digest links must be http(s) URLs");
  return escapeHtml(parsed.toString());
}
