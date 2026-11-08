import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format";

describe("formatDateTime", () => {
  it("formats in the user's zone", () => {
    expect(formatDateTime(new Date("2026-11-07T19:14:00Z"), "America/New_York")).toBe("Nov 7, 2:14 PM");
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(formatDateTime(new Date("2026-11-07T19:14:00Z"), "Not/AZone")).toBe("Nov 7, 7:14 PM");
  });
});
