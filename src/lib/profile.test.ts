import { describe, expect, it } from "vitest";
import {
  canonicalTimeZone,
  DEFAULT_TIME_ZONE,
  isProfileComplete,
  isValidTimeZone,
  profileSchema,
  profileSchemaFor,
  supportedTimeZones,
  timeZoneLabel,
  timeZoneSchema,
  timeZoneSchemaFor,
} from "./profile";

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

describe("profileSchemaFor", () => {
  const valid = { name: "Ada", school: "State University", gradYear: "2027" };

  it("accepts the user's stored zone even when the runtime does not list it", () => {
    expect(profileSchemaFor("Etc/GMT+5").parse({ ...valid, timezone: "Etc/GMT+5" }).timezone).toBe("Etc/GMT+5");
    expect(profileSchema.safeParse({ ...valid, timezone: "Etc/GMT+5" }).success).toBe(false);
  });

  it("stores a browser alias such as Asia/Kolkata as a zone the picker lists", () => {
    const zone = profileSchemaFor(DEFAULT_TIME_ZONE).parse({ ...valid, timezone: "Asia/Kolkata" }).timezone;
    expect(supportedTimeZones(DEFAULT_TIME_ZONE)).toContain(zone);
    expect(canonicalTimeZone(zone)).toBe(canonicalTimeZone("Asia/Kolkata"));
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

describe("timeZoneSchema", () => {
  it("trims a valid zone and rejects junk with a plain message", () => {
    expect(timeZoneSchema.parse(" Europe/Paris ")).toBe("Europe/Paris");
    const bad = timeZoneSchema.safeParse("Nowhere/Land");
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("Pick a valid time zone");
    expect(timeZoneSchema.safeParse(42).success).toBe(false);
  });

  it("returns the canonical zone name for other spellings", () => {
    expect(timeZoneSchema.parse("america/new_york")).toBe("America/New_York");
    expect(timeZoneSchema.parse(" EUROPE/PARIS ")).toBe("Europe/Paris");
    expect(timeZoneSchema.parse("utc")).toBe(DEFAULT_TIME_ZONE);
  });

  it.each(["+05:00", "-0330", "Etc/GMT+5"])("rejects %s, which is not in the picker list", (zone) => {
    const bad = timeZoneSchema.safeParse(zone);
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("Pick a valid time zone");
  });

  it("accepts a stored zone the runtime does not list when built for that zone", () => {
    expect(timeZoneSchemaFor("Etc/GMT+5").parse("Etc/GMT+5")).toBe("Etc/GMT+5");
    expect(timeZoneSchemaFor("Etc/GMT+5").safeParse("+05:00").success).toBe(false);
  });
});

describe("canonicalTimeZone", () => {
  it("resolves aliases and case, and returns null for junk", () => {
    expect(canonicalTimeZone("america/chicago")).toBe("America/Chicago");
    expect(canonicalTimeZone("Etc/UTC")).toBe("UTC");
    expect(canonicalTimeZone("Mars/Olympus")).toBeNull();
    expect(canonicalTimeZone("")).toBeNull();
  });
});

describe("supportedTimeZones", () => {
  it("lists IANA zones and always includes the default", () => {
    const zones = supportedTimeZones("America/New_York");
    expect(zones).toContain("America/New_York");
    expect(zones).toContain(DEFAULT_TIME_ZONE);
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("keeps a stored zone the runtime does not list, at the front", () => {
    const zones = supportedTimeZones("Etc/GMT+5");
    expect(zones.filter((zone) => zone === "Etc/GMT+5")).toHaveLength(1);
    expect(zones).toContain(DEFAULT_TIME_ZONE);
  });
});

describe("timeZoneLabel", () => {
  it("shows underscores as spaces", () => {
    expect(timeZoneLabel("America/New_York")).toBe("America/New York");
    expect(timeZoneLabel("UTC")).toBe("UTC");
  });
});
