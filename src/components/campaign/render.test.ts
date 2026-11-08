import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsentPanel, type ConsentPanelProps } from "./ConsentPanel";
import { RulesFields, type RulesFieldsProps } from "./RulesFields";
import { draftFromRules } from "./form-model";

const rules = {
  roles: ["intern" as const],
  autoCompanies: ["Stripe"],
  askFirstCompanies: [],
  resumeId: "r1",
  weeklyCap: 5,
  minMatch: 75,
  endsOn: "2026-11-01",
};
const noop = () => undefined;

const panel = (overrides: Partial<ConsentPanelProps>): string =>
  renderToStaticMarkup(
    createElement(ConsentPanel, {
      rules,
      resumeName: "r.pdf",
      status: "active",
      approvedLabel: null,
      pendingNote: null,
      changed: false,
      approveLabel: "Approve new rules",
      canApprove: false,
      approveReasons: [],
      canSave: false,
      busy: false,
      approveVersionId: "",
      approveRules: "",
      onApprove: noop,
      onSave: noop,
      onTogglePause: noop,
      onRevoke: noop,
      ...overrides,
    }),
  );

describe("ConsentPanel", () => {
  it("shows an ended campaign as Ended, without Pause", () => {
    const html = panel({ status: "ended" });
    expect(html).toContain(">Ended</span>");
    expect(html).not.toContain(">Active</span>");
    expect(html).not.toContain(">Pause</button>");
    expect(html).toContain(">Revoke</button>");
  });

  it("keeps an unavailable Approve focusable and describes why", () => {
    const html = panel({ approveReasons: ["This date has passed. Pick a new end date to start again."] });
    expect(html).toMatch(/<button type="submit" class="btn primary" aria-disabled="true" aria-describedby="approve-reasons">/);
    expect(html).toContain('id="approve-reasons"');
    expect(html).toContain("This date has passed. Pick a new end date to start again.");
  });

  it("shows no reasons when Approve is available", () => {
    const html = panel({ canApprove: true, approveReasons: ["stale"] });
    expect(html).not.toContain("approve-reasons");
    expect(html).not.toContain("aria-disabled");
  });

  it("lets the state row take focus after a revoke", () => {
    expect(panel({ status: null })).toContain('<div class="state" tabindex="-1">');
  });
});

describe("RulesFields", () => {
  const fields = (overrides: Partial<RulesFieldsProps>): string =>
    renderToStaticMarkup(
      createElement(RulesFields, {
        draft: draftFromRules(rules),
        companies: ["Stripe"],
        resumes: [{ id: "r1", filename: "r.pdf" }],
        minEndsOn: "2026-11-09",
        errors: {},
        onToggleRole: noop,
        onCycleCompany: noop,
        onChange: noop,
        onClamp: noop,
        ...overrides,
      }),
    );

  it("shows the role and end date errors next to their fields", () => {
    const html = fields({ errors: { roles: "Pick at least one role type.", endsOn: "This date has passed. Pick a new end date to start again." } });
    expect(html).toContain('aria-describedby="roles-error"');
    expect(html).toContain('<span id="roles-error" class="error">Pick at least one role type.</span>');
    expect(html).toContain('<span id="endsOn-error" class="error">This date has passed. Pick a new end date to start again.</span>');
  });
});
