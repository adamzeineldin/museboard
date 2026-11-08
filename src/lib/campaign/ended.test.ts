import { describe, expect, it } from "vitest";
import { effectiveCampaignStatus, isPastEnd } from "./ended";

describe("isPastEnd", () => {
  it("is inclusive of the end date in the user's zone", () => {
    // 2026-12-21T03:00Z is still Dec 20 in New York.
    expect(isPastEnd("2026-12-20", new Date("2026-12-21T03:00:00Z"), "America/New_York")).toBe(false);
    expect(isPastEnd("2026-12-20", new Date("2026-12-21T06:00:00Z"), "America/New_York")).toBe(true);
  });
});

describe("effectiveCampaignStatus", () => {
  const after = new Date("2027-01-02T12:00:00Z");
  it("reads an active campaign past its end as ended", () => {
    expect(effectiveCampaignStatus("active", "2026-12-20", after, "UTC")).toBe("ended");
  });
  it("leaves paused, revoked and campaigns without rules alone", () => {
    expect(effectiveCampaignStatus("paused", "2026-12-20", after, "UTC")).toBe("paused");
    expect(effectiveCampaignStatus("revoked", "2026-12-20", after, "UTC")).toBe("revoked");
    expect(effectiveCampaignStatus("active", null, after, "UTC")).toBe("active");
    expect(effectiveCampaignStatus("active", "2027-01-02", after, "UTC")).toBe("active");
  });
});
