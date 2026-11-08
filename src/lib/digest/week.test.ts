import { describe, expect, it } from "vitest";
import { digestWeek, safeTimeZone } from "./week";

describe("digestWeek", () => {
  const MONDAY_1300_UTC = new Date("2026-11-09T13:00:00Z");

  it("reports the ISO week that just ended, in New York (EST after the Nov 1 DST change)", () => {
    const week = digestWeek(MONDAY_1300_UTC, "America/New_York");
    expect(week).toMatchObject({ firstDay: "2026-11-02", lastDay: "2026-11-08", timeZone: "America/New_York" });
    expect(week.start.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-11-09T05:00:00.000Z");
  });

  it("uses the user's own Monday midnight (Tokyo is already Monday night)", () => {
    const week = digestWeek(MONDAY_1300_UTC, "Asia/Tokyo");
    expect(week.start.toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-11-08T15:00:00.000Z");
  });

  it("covers a week spanning a DST change (169 hours in New York: clocks fall back on Nov 1)", () => {
    const week = digestWeek(new Date("2026-11-03T12:00:00Z"), "America/New_York");
    expect(week.firstDay).toBe("2026-10-26");
    expect((week.end.getTime() - week.start.getTime()) / 3_600_000).toBe(169);
  });

  it("a mid-week run still reports the last full week, and exactly Monday 00:00 counts as ended", () => {
    expect(digestWeek(new Date("2026-11-12T12:00:00Z"), "UTC").firstDay).toBe("2026-11-02");
    expect(digestWeek(new Date("2026-11-09T00:00:00Z"), "UTC").lastDay).toBe("2026-11-08");
  });

  it("falls back to UTC for an invalid zone", () => {
    expect(safeTimeZone("Mars/Olympus")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
    expect(digestWeek(MONDAY_1300_UTC, "nope").timeZone).toBe("UTC");
  });
});
