import { describe, expect, it } from "vitest";
import { NO_JOB, initials, panelLabel, parseWarmPathParams, pickJobId, warmPathsHref } from "./selection";

describe("parseWarmPathParams", () => {
  it("reads contact, job and kind", () => {
    expect(parseWarmPathParams({ contact: "c1", job: "greenhouse:stripe:1", kind: "referral_ask" })).toEqual({
      contactId: "c1",
      jobId: "greenhouse:stripe:1",
      kind: "referral_ask",
    });
  });

  it("defaults to a coffee chat and ignores junk", () => {
    expect(parseWarmPathParams({ kind: "cold_email", contact: "", job: ["a", "b"] })).toEqual({ contactId: null, jobId: "a", kind: "coffee_chat" });
    expect(parseWarmPathParams({})).toEqual({ contactId: null, jobId: null, kind: "coffee_chat" });
  });

  it("rejects absurdly long ids", () => {
    expect(parseWarmPathParams({ contact: "x".repeat(500) }).contactId).toBeNull();
  });
});

describe("warmPathsHref", () => {
  it("builds a URL with only the set params", () => {
    expect(warmPathsHref({ contactId: "c1", jobId: null, kind: "coffee_chat" })).toBe("/warm-paths?contact=c1");
    expect(warmPathsHref({ contactId: "c1", jobId: "greenhouse:stripe:1", kind: "referral_ask" })).toBe(
      "/warm-paths?contact=c1&job=greenhouse%3Astripe%3A1&kind=referral_ask",
    );
    expect(warmPathsHref({ contactId: null, jobId: null, kind: "coffee_chat" })).toBe("/warm-paths");
  });
});

describe("pickJobId", () => {
  const jobs = [{ id: "j-new" }, { id: "j-old" }];
  it("keeps the requested job when it is open at the company", () => {
    expect(pickJobId(jobs, "j-old")).toBe("j-old");
  });
  it("returns null when the user chose no specific role", () => {
    expect(pickJobId(jobs, NO_JOB)).toBeNull();
  });
  it("falls back to the newest open job, or null", () => {
    expect(pickJobId(jobs, "elsewhere")).toBe("j-new");
    expect(pickJobId(jobs, null)).toBe("j-new");
    expect(pickJobId([], "j-old")).toBeNull();
  });
});

describe("initials", () => {
  it.each([
    ["Priya N.", "PN"],
    ["marcus", "M"],
    ["Dana Lee Smith", "DS"],
    ["  ", "?"],
  ])("%s -> %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("importSummary", () => {
  it("summarises created, skipped and failed rows", async () => {
    const { importSummary } = await import("./action-state");
    expect(importSummary({ created: 1, errors: [], duplicates: [] })).toBe("Imported 1 contact.");
    expect(importSummary({ created: 3, errors: [{ row: 2, message: "x" }], duplicates: [{ row: 4, name: "a", company: "b" }] })).toBe(
      "Imported 3 contacts, skipped 1 already saved, 1 row needs fixing.",
    );
  });
});

describe("panelLabel", () => {
  it("names the kind and the contact", () => {
    expect(panelLabel("coffee_chat", "Priya N.")).toBe("Coffee chat request to Priya N.");
    expect(panelLabel("referral_ask", "Priya N.")).toBe("Referral ask to Priya N.");
  });
});

describe("formatDay", () => {
  it("formats an ISO date and tolerates junk", async () => {
    const { formatDay } = await import("./format");
    expect(formatDay("2026-11-07T15:00:00.000Z")).toBe("Nov 7, 2026");
    expect(formatDay("not a date")).toBe("");
    expect(formatDay("2026-11-07T02:00:00.000Z", "America/Los_Angeles")).toBe("Nov 6, 2026");
    expect(formatDay("2026-11-07T15:00:00.000Z", "Not/AZone")).toBe("Nov 7, 2026");
  });
});
