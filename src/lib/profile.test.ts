import { describe, expect, it } from "vitest";
import { isProfileComplete, isValidTimeZone, profileSchema } from "./profile";

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("profileSchema", () => {
  const valid = { name: " Ada Lovelace ", school: "State University", gradYear: "2027", timezone: "America/Chicago" };

  it("parses form values and trims strings", () => {
    expect(profileSchema.parse(valid)).toEqual({ name: "Ada Lovelace", school: "State University", gradYear: 2027, timezone: "America/Chicago" });
  });

  it.each([
    ["empty name", { name: "  " }],
    ["empty school", { school: "" }],
    ["grad year too early", { gradYear: "1999" }],
    ["grad year too late", { gradYear: "2041" }],
    ["grad year not a number", { gradYear: "soon" }],
    ["bad time zone", { timezone: "Nowhere/Land" }],
  ])("rejects %s", (_label, patch) => {
    expect(profileSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("isProfileComplete", () => {
  it("requires name, school and grad year", () => {
    expect(isProfileComplete({ name: "A", school: "S", gradYear: 2027 })).toBe(true);
    expect(isProfileComplete({ name: null, school: "S", gradYear: 2027 })).toBe(false);
    expect(isProfileComplete({ name: "A", school: null, gradYear: 2027 })).toBe(false);
    expect(isProfileComplete({ name: "A", school: "S", gradYear: null })).toBe(false);
  });
});
