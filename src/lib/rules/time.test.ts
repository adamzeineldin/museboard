import { describe, expect, it } from "vitest";
import {
  addDaysToIsoDate,
  isoWeekRange,
  isoWeekStart,
  isValidTimeZone,
  localDateString,
  startOfLocalDay,
} from "./time";

const at = (iso: string) => new Date(iso);

describe("isValidTimeZone", () => {
  it("accepts IANA zones and UTC", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects unknown or empty zones", () => {
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("localDateString", () => {
  it("returns the calendar date in the given zone", () => {
    expect(localDateString(at("2026-11-07T12:00:00Z"), "UTC")).toBe("2026-11-07");
  });

  it("rolls forward for zones ahead of UTC", () => {
    expect(localDateString(at("2026-12-15T15:00:00Z"), "Asia/Tokyo")).toBe("2026-12-16");
    expect(localDateString(at("2026-12-15T09:59:59Z"), "Pacific/Kiritimati")).toBe("2026-12-15");
    expect(localDateString(at("2026-12-15T10:00:00Z"), "Pacific/Kiritimati")).toBe("2026-12-16");
  });

  it("rolls back for zones behind UTC", () => {
    expect(localDateString(at("2026-12-16T07:59:59Z"), "America/Los_Angeles")).toBe("2026-12-15");
    expect(localDateString(at("2026-12-16T08:00:00Z"), "America/Los_Angeles")).toBe("2026-12-16");
  });

  it("handles half-hour offsets", () => {
    expect(localDateString(at("2026-12-15T18:29:59Z"), "Asia/Kolkata")).toBe("2026-12-15");
    expect(localDateString(at("2026-12-15T18:30:00Z"), "Asia/Kolkata")).toBe("2026-12-16");
  });

  it("handles instants with milliseconds and before 1970", () => {
    expect(localDateString(at("2026-12-15T23:59:59.999Z"), "UTC")).toBe("2026-12-15");
    expect(localDateString(at("1969-12-31T23:59:59.500Z"), "UTC")).toBe("1969-12-31");
  });

  it("throws a clear error for an unknown time zone", () => {
    expect(() => localDateString(at("2026-11-07T00:00:00Z"), "Nope/Zone")).toThrow(RangeError);
    expect(() => localDateString(at("2026-11-07T00:00:00Z"), "Nope/Zone")).toThrow(/Unknown time zone/);
  });

  it("throws for an invalid Date", () => {
    expect(() => localDateString(new Date("not a date"), "UTC")).toThrow(TypeError);
  });
});

describe("addDaysToIsoDate", () => {
  it("adds and subtracts calendar days across month and year ends", () => {
    expect(addDaysToIsoDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToIsoDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToIsoDate("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("rejects malformed dates", () => {
    expect(() => addDaysToIsoDate("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDaysToIsoDate("12/15/2026", 1)).toThrow(RangeError);
  });
});

describe("startOfLocalDay", () => {
  it("returns local midnight for UTC and fixed offsets", () => {
    expect(startOfLocalDay("2026-11-09", "UTC").toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(startOfLocalDay("2026-11-09", "Asia/Tokyo").toISOString()).toBe("2026-11-08T15:00:00.000Z");
    expect(startOfLocalDay("2026-11-09", "Asia/Kolkata").toISOString()).toBe("2026-11-08T18:30:00.000Z");
  });

  it("uses the offset in effect at that midnight on DST change days", () => {
    // New York springs forward at 02:00 on 2026-03-08: midnight is still EST (-5).
    expect(startOfLocalDay("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(startOfLocalDay("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    // New York falls back at 02:00 on 2026-11-01: midnight is still EDT (-4).
    expect(startOfLocalDay("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfLocalDay("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("returns the first instant of the day when local midnight is skipped", () => {
    // Chile jumped from 2024-09-07 24:00 (-4) straight to 2024-09-08 01:00 (-3).
    expect(startOfLocalDay("2024-09-08", "America/Santiago").toISOString()).toBe("2024-09-08T04:00:00.000Z");
  });

  it("returns the first instant after a calendar day the zone skipped entirely", () => {
    // Samoa jumped from 2011-12-29 24:00 (-10) to 2011-12-31 00:00 (+14); Dec 30 never happened there.
    expect(startOfLocalDay("2011-12-30", "Pacific/Apia").toISOString()).toBe("2011-12-30T10:00:00.000Z");
  });

  it("finds the jump when a DST gap starts before midnight and ends after it", () => {
    // Toronto jumped from 1919-03-30 23:30 (-5) to 1919-03-31 00:30 (-4), a Monday.
    expect(startOfLocalDay("1919-03-31", "America/Toronto").toISOString()).toBe("1919-03-31T04:30:00.000Z");
    expect(isoWeekStart(new Date("1919-04-02T12:00:00Z"), "America/Toronto").toISOString()).toBe(
      "1919-03-31T04:30:00.000Z",
    );
  });

  it("rejects malformed dates and unknown zones", () => {
    expect(() => startOfLocalDay("2026-13-01", "UTC")).toThrow(RangeError);
    expect(() => startOfLocalDay("2026-11-09", "Nope/Zone")).toThrow(/Unknown time zone/);
  });
});

describe("isoWeekStart", () => {
  it("returns Monday 00:00 local for a mid-week instant", () => {
    // Saturday 2026-11-07 in UTC.
    expect(isoWeekStart(at("2026-11-07T12:00:00Z"), "UTC").toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("treats Monday 00:00 itself as the start of the week", () => {
    expect(isoWeekStart(at("2026-11-02T00:00:00Z"), "UTC").toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(isoWeekStart(at("2026-11-01T23:59:59.999Z"), "UTC").toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("treats Sunday as the last day of the ISO week", () => {
    expect(isoWeekStart(at("2026-11-08T23:00:00Z"), "UTC").toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("uses the local week for zones ahead of UTC", () => {
    // UTC is still Sunday 16:00, but Tokyo is already Monday 01:00.
    expect(isoWeekStart(at("2026-11-08T16:00:00Z"), "Asia/Tokyo").toISOString()).toBe("2026-11-08T15:00:00.000Z");
  });

  it("uses the local week for zones behind UTC", () => {
    // UTC is Monday 05:00, but Los Angeles is still Sunday 21:00.
    expect(isoWeekStart(at("2026-11-09T05:00:00Z"), "America/Los_Angeles").toISOString()).toBe(
      "2026-11-02T08:00:00.000Z",
    );
  });

  it("is correct for weeks that contain a DST change", () => {
    // Week of 2026-10-26 in New York contains the fall-back on 2026-11-01; Monday is EDT.
    expect(isoWeekStart(at("2026-11-01T12:00:00Z"), "America/New_York").toISOString()).toBe(
      "2026-10-26T04:00:00.000Z",
    );
    // London falls back on 2026-10-25 (a Sunday); the week began on BST.
    expect(isoWeekStart(at("2026-10-25T12:00:00Z"), "Europe/London").toISOString()).toBe(
      "2026-10-18T23:00:00.000Z",
    );
  });
});

describe("isoWeekRange", () => {
  it("spans exactly seven days on a normal week", () => {
    const { start, end } = isoWeekRange(at("2026-11-07T12:00:00Z"), "UTC");
    expect(start.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("is 169 hours long when the week contains a fall-back", () => {
    const { start, end } = isoWeekRange(at("2026-10-28T12:00:00Z"), "America/New_York");
    expect(start.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(169);
  });

  it("is 167 hours long when the week contains a spring-forward", () => {
    const { start, end } = isoWeekRange(at("2026-03-05T12:00:00Z"), "America/New_York");
    expect(start.toISOString()).toBe("2026-03-02T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(167);
  });

  it("contains now (start inclusive, end exclusive)", () => {
    const now = at("2026-11-08T16:00:00Z");
    const { start, end } = isoWeekRange(now, "Asia/Tokyo");
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });
});
