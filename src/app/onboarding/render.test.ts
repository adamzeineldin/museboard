import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingFields } from "./OnboardingFields";
import { fieldValues, INITIAL_ONBOARDING_STATE, withBrowserTimeZone, type OnboardingState } from "./form-state";

const DEFAULTS = { name: "", school: "", gradYear: "", timezone: "UTC" };
const ZONES = ["UTC", "America/Chicago", "America/New_York"];
const YEARS = [2026, 2027, 2028];

const render = (state: OnboardingState): string =>
  renderToStaticMarkup(
    createElement(OnboardingFields, {
      values: fieldValues(state, DEFAULTS),
      errors: state.fieldErrors,
      timeZones: ZONES,
      gradYears: YEARS,
    }),
  );

describe("fieldValues", () => {
  it("uses the server defaults until a submit echoes values back", () => {
    expect(fieldValues(INITIAL_ONBOARDING_STATE, DEFAULTS)).toBe(DEFAULTS);
    const values = { name: "Jordan", school: "State", gradYear: "", timezone: "America/Chicago" };
    expect(fieldValues({ fieldErrors: { gradYear: "x" }, formError: null, values }, DEFAULTS)).toBe(values);
  });
});

describe("withBrowserTimeZone", () => {
  it("keeps the list when the browser zone is missing or already listed", () => {
    expect(withBrowserTimeZone(ZONES, null)).toBe(ZONES);
    expect(withBrowserTimeZone(ZONES, "America/Chicago")).toBe(ZONES);
  });

  it("adds an unlisted browser zone such as Asia/Kolkata at the front without changing the input", () => {
    const zones = withBrowserTimeZone(ZONES, "Asia/Kolkata");
    expect(zones).toEqual(["Asia/Kolkata", ...ZONES]);
    expect(ZONES).toEqual(["UTC", "America/Chicago", "America/New_York"]);
  });
});

describe("OnboardingFields markup", () => {
  it("renders the defaults with no error wiring before a submit", () => {
    const html = render(INITIAL_ONBOARDING_STATE);
    expect(html).toContain("Weekly limits reset Monday at midnight in this time zone.");
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("-error");
    expect(html).toMatch(/name="timezone"[^>]*aria-describedby="onboarding-timezone-hint"/);
    expect(html).toMatch(/<option value="UTC" selected="">UTC<\/option>/);
  });

  it("keeps what the user typed and picked after a validation error", () => {
    const html = render({
      fieldErrors: { gradYear: "Check your graduation year" },
      formError: null,
      values: { name: "Jordan Lee", school: "State University", gradYear: "", timezone: "America/Chicago" },
    });
    expect(html).toContain('value="Jordan Lee"');
    expect(html).toContain('value="State University"');
    expect(html).toMatch(/<option value="America\/Chicago" selected="">America\/Chicago<\/option>/);
    expect(html).not.toMatch(/<option value="UTC" selected="">/);
  });

  it("links each error to its field so screen readers announce it", () => {
    const html = render({
      fieldErrors: { school: "Add your school", timezone: "Pick a valid time zone" },
      formError: null,
      values: { name: "Jordan", school: "", gradYear: "2027", timezone: "Nowhere/Land" },
    });
    const tag = (name: string): string => html.match(new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
    expect(tag("school")).toContain('aria-invalid="true"');
    expect(tag("school")).toContain('aria-describedby="onboarding-school-error"');
    expect(html).toContain('<span class="error" id="onboarding-school-error">Add your school</span>');
    expect(tag("timezone")).toContain('aria-invalid="true"');
    expect(tag("timezone")).toContain('aria-describedby="onboarding-timezone-hint onboarding-timezone-error"');
    expect(html).toContain('id="onboarding-timezone-error">Pick a valid time zone</span>');
    expect(tag("name")).not.toContain("aria-invalid");
    expect(tag("name")).not.toContain("aria-describedby");
  });
});
