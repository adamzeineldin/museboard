// Pure date formatting in the user's time zone (done on the server so markup matches on hydration).

/** "Nov 7, 2:14 PM" in `timeZone`. */
export function formatDateTime(date: Date, timeZone: string): string {
  try {
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
  } catch {
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  }
}
