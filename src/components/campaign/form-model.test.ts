import { describe, expect, it } from "vitest";
import {
  approveState,
  companyChipModel,
  cycleCompany,
  draftFromRules,
  draftToRules,
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
});
