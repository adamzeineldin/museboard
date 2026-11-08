import { describe, expect, it } from "vitest";
import {
  approveState,
  companyChipModel,
  cycleCompany,
  draftFromRules,
  draftErrors,
  draftToRules,
  endsOnError,
  initialDraft,
  listCompanies,
  toggleRole,
  type CampaignDraft,
} from "./form-model";

const rules = {
  roles: ["intern" as const],
  autoCompanies: ["Stripe", "Datadog"],
  askFirstCompanies: ["Meta"],
  resumeId: "r1",
  weeklyCap: 5,
  minMatch: 75,
  endsOn: "2026-12-15",
};
const order = ["Datadog", "Meta", "Palantir", "Stripe"];
const draft: CampaignDraft = draftFromRules(rules);

describe("campaign form model", () => {
  it("lists every company with open jobs plus any in the rules, alphabetically and without duplicates", () => {
    expect(listCompanies(["Stripe", "datadog", "Palantir"], [rules, null])).toEqual(["datadog", "Meta", "Palantir", "Stripe"]);
  });

  it("starts from the pending version, then the one in force, then defaults", () => {
    const defaults = { resumeId: "r9", endsOn: "2026-12-20" };
    const pending = { ...rules, weeklyCap: 3 };
    expect(initialDraft({ pending, inForce: rules, defaults }).weeklyCap).toBe("3");
    expect(initialDraft({ pending: null, inForce: rules, defaults }).weeklyCap).toBe("5");
    expect(initialDraft({ pending: null, inForce: null, defaults })).toEqual({
      roles: ["intern"],
      auto: [],
      ask: [],
      resumeId: "r9",
      weeklyCap: "5",
      minMatch: "75",
      endsOn: "2026-12-20",
    });
  });

  it("cycles a company auto -> ask first -> skip -> auto, keeping lists in display order", () => {
    const asked = cycleCompany(draft, "Stripe", order);
    expect(asked).toMatchObject({ auto: ["Datadog"], ask: ["Meta", "Stripe"] });
    const skipped = cycleCompany(asked, "Stripe", order);
    expect(skipped).toMatchObject({ auto: ["Datadog"], ask: ["Meta"] });
    const auto = cycleCompany(cycleCompany(skipped, "Palantir", order), "Stripe", order);
    expect(auto.auto).toEqual(["Datadog", "Palantir", "Stripe"]);
    expect(draft.auto).toEqual(["Stripe", "Datadog"]); // not mutated
  });

  it("describes each chip's state for sight and screen readers", () => {
    expect(companyChipModel(draft, "Stripe")).toEqual({ state: "auto", label: "auto", spoken: "auto-apply" });
    expect(companyChipModel(draft, "Meta").label).toBe("ask first");
    expect(companyChipModel(draft, "Palantir")).toMatchObject({ state: "off", label: "skip" });
  });

  it("toggles role types", () => {
    expect(toggleRole(draft, "newgrad").roles).toEqual(["intern", "newgrad"]);
    expect(toggleRole(draft, "intern").roles).toEqual([]);
  });

  it("converts to rules and reports field errors", () => {
    expect(draftToRules(draft)).toEqual({ ok: true, rules });
    const bad = draftToRules({ ...draft, weeklyCap: "50", minMatch: "", resumeId: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["minMatch", "resumeId", "weeklyCap"]);
  });

  it("enables approval only for a real, complete change", () => {
    expect(approveState(draft, { inForce: null, pending: null, minEndsOn: "2026-11-08" })).toEqual({
      canApprove: true,
      canSave: true,
      changed: false,
      label: "Approve campaign",
      reasons: [],
    });
    expect(approveState(draft, { inForce: rules, pending: null, minEndsOn: "2026-11-08" })).toMatchObject({
      canApprove: false,
      canSave: false,
      label: "Approve new rules",
    });
    const edited = { ...draft, weeklyCap: "3" };
    expect(approveState(edited, { inForce: rules, pending: null, minEndsOn: "2026-11-08" })).toMatchObject({
      canApprove: true,
      canSave: true,
      changed: true,
    });
    const pending = { ...rules, weeklyCap: 3 };
    expect(approveState(edited, { inForce: rules, pending, minEndsOn: "2026-11-08" })).toMatchObject({
      canApprove: true,
      canSave: false,
    });
    expect(approveState({ ...draft, auto: [] }, { inForce: null, pending: null, minEndsOn: "2026-11-08" }).canApprove).toBe(false);
    expect(approveState({ ...draft, roles: [] }, { inForce: null, pending: null, minEndsOn: "2026-11-08" }).canApprove).toBe(false);
    expect(approveState({ ...draft, endsOn: "2026-11-07" }, { inForce: null, pending: null, minEndsOn: "2026-11-08" }).canApprove).toBe(false);
  });

  it("lets the user save the rules in force over a pending version, which withdraws it", () => {
    const pending = { ...rules, weeklyCap: 3 };
    expect(approveState(draft, { inForce: rules, pending, minEndsOn: "2026-11-08" })).toMatchObject({
      canApprove: false,
      canSave: true,
      changed: false,
    });
  });

  it("explains why Approve is unavailable", () => {
    const ctx = { inForce: null, pending: null, minEndsOn: "2026-11-09" };
    expect(approveState({ ...draft, roles: [], auto: [] }, ctx).reasons).toEqual([
      "Pick at least one role type.",
      "Set at least one company to auto-apply.",
    ]);
    expect(approveState({ ...draft, weeklyCap: "" }, ctx).reasons).toEqual(["Fix the fields marked above."]);
    expect(approveState({ ...draft, endsOn: "2026-11-08" }, ctx)).toMatchObject({
      canApprove: false,
      reasons: ["Pick an end date after today."],
    });
  });

  it("names company-list problems, which have no field marking of their own", () => {
    const ctx = { inForce: null, pending: null, minEndsOn: "2026-11-09" };
    expect(approveState({ ...draft, ask: ["Meta", "stripe"] }, ctx)).toMatchObject({
      canApprove: false,
      reasons: ["A company can't be both auto-apply and ask first: stripe."],
    });
    const many = Array.from({ length: 201 }, (_, i) => `Co ${i}`);
    expect(approveState({ ...draft, auto: many }, ctx)).toMatchObject({
      canApprove: false,
      reasons: ["Pick at most 200 companies to auto-apply."],
    });
    expect(approveState({ ...draft, ask: many }, ctx).reasons).toEqual(["Pick at most 200 companies to ask about first."]);
    expect(approveState({ ...draft, weeklyCap: "", ask: many }, ctx).reasons).toEqual([
      "Pick at most 200 companies to ask about first.",
      "Fix the fields marked above.",
    ]);
  });

  it("says the rules are already in force when the draft matches them", () => {
    const pending = { ...rules, weeklyCap: 3 };
    for (const ctxPending of [null, pending]) {
      expect(approveState(draft, { inForce: rules, pending: ctxPending, minEndsOn: "2026-11-08" })).toMatchObject({
        canApprove: false,
        reasons: ["These rules are already in force. Change a rule to approve new ones."],
      });
    }
  });

  it.each([
    ["no campaign, complete", draft, null, null],
    ["no campaign, missing roles", { ...draft, roles: [] }, null, null],
    ["no campaign, no auto company", { ...draft, auto: [] }, null, null],
    ["no campaign, bad cap", { ...draft, weeklyCap: "" }, null, null],
    ["no campaign, bad role value", { ...draft, roles: ["nope" as never] }, null, null],
    ["no campaign, end date today", { ...draft, endsOn: "2026-11-08" }, null, null],
    ["no campaign, company in both lists", { ...draft, ask: ["Stripe"] }, null, null],
    ["no campaign, too many companies", { ...draft, auto: Array.from({ length: 201 }, (_, i) => `Co ${i}`) }, null, null],
    ["in force, unchanged", draft, rules, null],
    ["in force, unchanged with pending", draft, rules, { ...rules, weeklyCap: 3 }],
    ["in force, changed", { ...draft, weeklyCap: "3" }, rules, null],
    ["in force, changed but incomplete", { ...draft, weeklyCap: "3", roles: [] }, rules, null],
    ["in force ended, unchanged", draftFromRules({ ...rules, endsOn: "2026-11-01" }), { ...rules, endsOn: "2026-11-01" }, null],
  ])("always gives a reason when Approve is unavailable (%s)", (_name, state, inForce, pending) => {
    const result = approveState(state, { inForce, pending, minEndsOn: "2026-11-09" });
    if (!result.canApprove) expect(result.reasons.length).toBeGreaterThan(0);
    else expect(result.reasons).toEqual([]);
  });

  it("flags an end date that has passed, even when it is the date of the rules in force", () => {
    const ended = { ...rules, endsOn: "2026-11-01" };
    const state = approveState(draftFromRules(ended), { inForce: ended, pending: null, minEndsOn: "2026-11-09" });
    expect(state).toMatchObject({ canApprove: false, reasons: ["This date has passed. Pick a new end date to start again."] });
    expect(draftErrors(draftFromRules(ended), "2026-11-09")).toEqual({
      endsOn: "This date has passed. Pick a new end date to start again.",
    });
  });
});

describe("endsOnError", () => {
  it("accepts dates from the minimum on and explains earlier ones", () => {
    expect(endsOnError("2026-11-09", "2026-11-09")).toBeNull();
    expect(endsOnError("2026-11-08", "2026-11-09")).toBe("Pick an end date after today.");
    expect(endsOnError("2026-11-07", "2026-11-09")).toBe("This date has passed. Pick a new end date to start again.");
    expect(endsOnError("", "2026-11-09")).toBeNull();
  });

  it("keeps schema errors and adds the end-date error only when the date itself is valid", () => {
    expect(draftErrors({ ...draft, endsOn: "" }, "2026-11-09")).toEqual({ endsOn: "Pick an end date." });
    expect(draftErrors({ ...draft, roles: [] }, "2026-11-09")).toEqual({ roles: "Pick at least one role type." });
    expect(draftErrors(draft, "2026-11-09")).toEqual({});
  });
});
