import { describe, expect, it } from "vitest";
import { campaignCardModel } from "./campaign-card-model";
import { formatLongDate, formatRelative, formatShortDate } from "./format";
import { MUSE_CONNECTION_CHIP, museConnectionState } from "./muse-connection";
import { museEventModel } from "./muse-event-model";

describe("formatShortDate", () => {
  it("formats a calendar day without timezone drift", () => {
    expect(formatShortDate("2026-12-15")).toBe("Dec 15");
    expect(formatShortDate("not-a-date")).toBe("not-a-date");
  });
  it("formatLongDate includes the year", () => {
    expect(formatLongDate("2026-12-15")).toBe("Dec 15, 2026");
    expect(formatLongDate("2031-01-02")).toBe("Jan 2, 2031");
    expect(formatLongDate("not-a-date")).toBe("not-a-date");
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
    expect(campaignCardModel({ status: "active", weeklyCap: 5, endsOn: "2026-12-15", weekCount: 2, pastEnd: false })).toEqual({
      kind: "active",
      heading: "Active · 2 of 5 used this week",
      meterPercent: 40,
      endsLabel: "Ends Dec 15",
    });
  });

  it("caps the meter and handles paused and unknown counts", () => {
    expect(campaignCardModel({ status: "paused", weeklyCap: 2, endsOn: "2026-12-15", weekCount: 5, pastEnd: false })).toMatchObject({
      heading: "Paused · 5 of 2 used this week",
      meterPercent: 100,
    });
    expect(campaignCardModel({ status: "active", weeklyCap: 5, endsOn: "2026-12-15", weekCount: null, pastEnd: false })).toMatchObject({
      heading: "Active · – of 5 used this week",
      meterPercent: 0,
    });
  });
});

describe("campaignCardModel when the end date has passed", () => {
  it("shows an ended campaign as Ended, with no weekly usage", () => {
    expect(campaignCardModel({ status: "ended", weeklyCap: 5, endsOn: "2026-11-01", weekCount: 0, pastEnd: true })).toEqual({
      kind: "ended",
      heading: "Ended",
      endsLabel: "Ended Nov 1. Pick a new end date to start again.",
    });
  });

  it("says a paused campaign past its end date needs a new end date before it can resume", () => {
    expect(campaignCardModel({ status: "paused", weeklyCap: 5, endsOn: "2026-11-01", weekCount: 1, pastEnd: true })).toEqual({
      kind: "ended",
      heading: "Paused",
      endsLabel: "Ended Nov 1. Pick a new end date, then resume.",
    });
  });
});

describe("museEventModel", () => {
  const base = { id: "e1", createdAt: new Date("2026-11-07T12:00:00Z") };

  it("renders Muse tool calls (muse.<tool>) as inroad.<tool> with a summary", () => {
    expect(museEventModel({ ...base, action: "muse.find_roles", payload: { ok: true, summary: "8 roles" } })).toEqual({
      ...base,
      tool: "inroad.find_roles",
      summary: "8 roles",
      failed: false,
    });
  });

  it("marks a call whose payload says ok: false as failed", () => {
    const model = museEventModel({ ...base, action: "muse.submit_application", payload: { ok: false, summary: "Not released" } });
    expect(model).toMatchObject({ tool: "inroad.submit_application", summary: "Not released", failed: true });
  });

  it("falls back to reason, keeps other actions as-is, and tolerates odd payloads", () => {
    expect(museEventModel({ ...base, action: "muse.prepare_application", payload: { reason: "Fits campaign rules" } }).summary).toBe(
      "Fits campaign rules",
    );
    expect(museEventModel({ ...base, action: "campaign.approved", payload: [] })).toMatchObject({
      tool: "campaign.approved",
      summary: null,
      failed: false,
    });
    expect(museEventModel({ ...base, action: "x", payload: null })).toMatchObject({ summary: null, failed: false });
  });

  it("truncates long summaries", () => {
    const summary = museEventModel({ ...base, action: "x", payload: { summary: "a".repeat(300) } }).summary;
    expect(summary).toHaveLength(140);
    expect(summary?.endsWith("…")).toBe(true);
  });
});

describe("museConnectionState", () => {
  it("is connected only when an active token has been used", () => {
    expect(museConnectionState({ active: 2, used: 1 })).toBe("connected");
    expect(museConnectionState({ active: 1, used: 0 })).toBe("unused");
    expect(museConnectionState({ active: 0, used: 0 })).toBe("none");
  });

  it("labels each state in plain English", () => {
    expect(MUSE_CONNECTION_CHIP.connected).toEqual({ tone: "ok", label: "Connected", subtitle: "Your agent, using Inroad" });
    expect(MUSE_CONNECTION_CHIP.unused).toEqual({
      tone: "neutral",
      label: "Not used yet",
      subtitle: "You created a token. Muse hasn't used it yet.",
    });
    expect(MUSE_CONNECTION_CHIP.none).toEqual({ tone: "neutral", label: "Not connected", subtitle: "Your agent, using Inroad" });
  });
});
