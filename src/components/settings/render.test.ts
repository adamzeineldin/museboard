import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TimeZoneForm, TimeZoneResult } from "./TimeZoneForm";
import { IDLE_TIME_ZONE_STATE, shownTimeZone, timeZoneSelectA11y, visibleResult, type TimeZoneFormState } from "./time-zone-state";

const action = vi.fn(async () => IDLE_TIME_ZONE_STATE);
const ZONES = ["UTC", "America/Chicago", "America/New_York"];

describe("shownTimeZone", () => {
  it("shows the saved zone until an action returns a selection", () => {
    expect(shownTimeZone(IDLE_TIME_ZONE_STATE, "UTC")).toBe("UTC");
    expect(shownTimeZone({ status: "error", message: "x", selected: "America/Chicago", nonce: 2 }, "UTC")).toBe("America/Chicago");
  });
});

describe("TimeZoneForm markup", () => {
  it("renders a labelled picker on the saved zone with the weekly reset hint", () => {
    const html = renderToStaticMarkup(createElement(TimeZoneForm, { current: "America/New_York", timeZones: ZONES, action }));
    expect(html).toContain('<label for="settings-timezone"');
    expect(html).toContain(">Time zone</label>");
    expect(html).toMatch(/<select[^>]*id="settings-timezone"[^>]*aria-describedby="settings-timezone-hint"/);
    expect(html).toContain('<option value="America/New_York" selected="">America/New York</option>');
    expect(html).toContain("Your weekly limit resets every Monday at 00:00 in this time zone.");
    expect(html).toContain("Changing it takes effect right away. It moves when your week starts and when your campaign&#x27;s end date ends.");
    expect(html).not.toContain("aria-invalid");
    expect(html).toContain(">Save time zone</button>");
    expect(html).not.toContain("aria-live");
    expect(html).not.toMatch(/<button[^>]*disabled/);
    expect(html).not.toContain("—");
  });
});

const ERROR: TimeZoneFormState = { status: "error", message: "Pick a time zone from the list.", selected: null, nonce: 7 };
const SAVED: TimeZoneFormState = { status: "success", message: "Saved.", selected: "UTC", nonce: 8 };

describe("visibleResult", () => {
  it("hides any result while a save is pending so a repeat is announced again", () => {
    expect(visibleResult(IDLE_TIME_ZONE_STATE, false)).toBeNull();
    expect(visibleResult(ERROR, false)).toBe("error");
    expect(visibleResult(ERROR, true)).toBeNull();
    expect(visibleResult(SAVED, false)).toBe("success");
    expect(visibleResult(SAVED, true)).toBeNull();
  });
});

describe("timeZoneSelectA11y", () => {
  it("points at the hint, and marks the picker invalid with the error on a shown error", () => {
    expect(timeZoneSelectA11y(IDLE_TIME_ZONE_STATE, false)).toEqual({ "aria-invalid": undefined, "aria-describedby": "settings-timezone-hint" });
    expect(timeZoneSelectA11y(ERROR, false)).toEqual({
      "aria-invalid": true,
      "aria-describedby": "settings-timezone-hint settings-timezone-error",
    });
    expect(timeZoneSelectA11y(ERROR, true)["aria-invalid"]).toBeUndefined();
  });
});

describe("TimeZoneResult markup", () => {
  it("renders an error as an alert with the id the picker points at", () => {
    const html = renderToStaticMarkup(createElement(TimeZoneResult, { state: ERROR, pending: false }));
    expect(html).toBe('<p class="banner hold" role="alert" id="settings-timezone-error">Pick a time zone from the list.</p>');
  });

  it("renders success as a status and nothing while pending", () => {
    expect(renderToStaticMarkup(createElement(TimeZoneResult, { state: SAVED, pending: false }))).toBe('<p class="banner" role="status">Saved.</p>');
    expect(renderToStaticMarkup(createElement(TimeZoneResult, { state: ERROR, pending: true }))).toBe("");
  });
});
