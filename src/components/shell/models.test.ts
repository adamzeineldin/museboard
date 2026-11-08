import { describe, expect, it } from "vitest";
import { campaignCardModel } from "./campaign-card-model";
import { formatRelative, formatShortDate } from "./format";
import { museEventModel } from "./muse-event-model";

describe("formatShortDate", () => {
  it("formats a calendar day without timezone drift", () => {
    expect(formatShortDate("2026-12-15")).toBe("Dec 15");
    expect(formatShortDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  it.each([
    [new Date("2026-11-07T11:59:30Z"), "just now"],
    [new Date("2026-11-07T11:55:00Z"), "5 min ago"],
    [new Date("2026-11-07T11:00:00Z"), "1 hour ago"],
    [new Date("2026-11-07T07:00:00Z"), "5 hours ago"],
    [new Date("2026-11-06T12:00:00Z"), "1 day ago"],
    [new Date("2026-11-03T12:00:00Z"), "4 days ago"],
    [new Date("2026-11-08T12:00:00Z"), "just now"],
  ])("%s -> %s", (date, label) => {
    expect(formatRelative(date, now)).toBe(label);
  });
});

describe("campaignCardModel", () => {
  it("shows the not-approved state when there is no campaign in force", () => {
    expect(campaignCardModel(null)).toEqual({ kind: "none" });
  });

  it("matches the prototype copy for an active campaign", () => {
    expect(campaignCardModel({ status: "active", weeklyCap: 5, endsOn: "2026-12-15", weekCount: 2 })).toEqual({
      kind: "active",
      heading: "Active · 2 of 5 this week",
      meterPercent: 40,
      endsLabel: "Ends Dec 15",
    });
  });

  it("caps the meter and handles paused and unknown counts", () => {
    expect(campaignCardModel({ status: "paused", weeklyCap: 2, endsOn: "2026-12-15", weekCount: 5 })).toMatchObject({
      heading: "Paused · 5 of 2 this week",
      meterPercent: 100,
    });
    expect(campaignCardModel({ status: "active", weeklyCap: 5, endsOn: "2026-12-15", weekCount: null })).toMatchObject({
      heading: "Active · – of 5 this week",
      meterPercent: 0,
    });
  });
});

describe("museEventModel", () => {
  const base = { id: "e1", createdAt: new Date("2026-11-07T12:00:00Z") };

  it("renders tool actions as inroad.<tool> with a summary", () => {
    expect(museEventModel({ ...base, action: "tool.find_roles", payload: { summary: "8 roles" } })).toEqual({
      ...base,
      tool: "inroad.find_roles",
      summary: "8 roles",
    });
  });

  it("falls back to reason, keeps other actions as-is, and tolerates odd payloads", () => {
    expect(museEventModel({ ...base, action: "tool.prepare_application", payload: { reason: "Fits campaign rules" } }).summary).toBe(
      "Fits campaign rules",
    );
    expect(museEventModel({ ...base, action: "campaign.approved", payload: [] })).toMatchObject({ tool: "campaign.approved", summary: null });
    expect(museEventModel({ ...base, action: "x", payload: null }).summary).toBeNull();
  });

  it("truncates long summaries", () => {
    const summary = museEventModel({ ...base, action: "x", payload: { summary: "a".repeat(300) } }).summary;
    expect(summary).toHaveLength(140);
    expect(summary?.endsWith("…")).toBe(true);
  });
});
