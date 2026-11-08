import { rulesEqual } from "@/lib/campaign/equality";
import {
  CampaignRulesSchema,
  MIN_MATCH_MAX,
  MIN_MATCH_MIN,
  WEEKLY_CAP_MAX,
  WEEKLY_CAP_MIN,
  type CampaignRules,
  type JobType,
} from "@/lib/types";

// Pure state for the campaign form (prototype vCampaign). Numbers stay strings while the user types.

export interface CampaignDraft {
  roles: JobType[];
  auto: string[];
  ask: string[];
  resumeId: string;
  weeklyCap: string;
  minMatch: string;
  endsOn: string;
}

export type CompanyState = "auto" | "ask" | "off";

export const DEFAULT_WEEKLY_CAP = 5;
export const DEFAULT_MIN_MATCH = 75;

const CHIP_LABEL: Record<CompanyState, string> = { auto: "auto", ask: "ask first", off: "skip" };
const CHIP_SPOKEN: Record<CompanyState, string> = { auto: "auto-apply", ask: "ask me first", off: "skip" };
const NEXT_STATE: Record<CompanyState, CompanyState> = { off: "auto", auto: "ask", ask: "off" };

const lower = (name: string): string => name.trim().toLowerCase();
const byName = (a: string, b: string): number => a.localeCompare(b, "en", { sensitivity: "base" });

/** Every company with open jobs plus any named in the given rules, deduplicated case-insensitively. */
export function listCompanies(withOpenJobs: readonly string[], rules: ReadonlyArray<CampaignRules | null>): string[] {
  const seen = new Map<string, string>();
  const named = rules.flatMap((r) => (r ? [...r.autoCompanies, ...r.askFirstCompanies] : []));
  for (const name of [...withOpenJobs, ...named]) {
    if (name.trim() && !seen.has(lower(name))) seen.set(lower(name), name.trim());
  }
  return [...seen.values()].sort(byName);
}

export function draftFromRules(rules: CampaignRules): CampaignDraft {
  return {
    roles: [...rules.roles],
    auto: [...rules.autoCompanies],
    ask: [...rules.askFirstCompanies],
    resumeId: rules.resumeId,
    weeklyCap: String(rules.weeklyCap),
    minMatch: String(rules.minMatch),
    endsOn: rules.endsOn,
  };
}

interface InitialDraftInput {
  pending: CampaignRules | null;
  inForce: CampaignRules | null;
  defaults: { resumeId: string; endsOn: string };
}

export function initialDraft({ pending, inForce, defaults }: InitialDraftInput): CampaignDraft {
  const source = pending ?? inForce;
  if (source) return draftFromRules(source);
  return {
    roles: ["intern"],
    auto: [],
    ask: [],
    resumeId: defaults.resumeId,
    weeklyCap: String(DEFAULT_WEEKLY_CAP),
    minMatch: String(DEFAULT_MIN_MATCH),
    endsOn: defaults.endsOn,
  };
}

export function companyState(draft: CampaignDraft, name: string): CompanyState {
  if (draft.auto.some((n) => lower(n) === lower(name))) return "auto";
  if (draft.ask.some((n) => lower(n) === lower(name))) return "ask";
  return "off";
}

export interface CompanyChipModel {
  state: CompanyState;
  label: string;
  /** Spoken state, read after the visible name (the chip's accessible name comes from its text). */
  spoken: string;
}

export function companyChipModel(draft: CampaignDraft, name: string): CompanyChipModel {
  const state = companyState(draft, name);
  return { state, label: CHIP_LABEL[state], spoken: CHIP_SPOKEN[state] };
}

/** auto -> ask first -> skip -> auto. Lists stay in display order. Returns a new draft. */
export function cycleCompany(draft: CampaignDraft, name: string, order: readonly string[]): CampaignDraft {
  const next = NEXT_STATE[companyState(draft, name)];
  const without = (list: readonly string[]) => list.filter((n) => lower(n) !== lower(name));
  const rank = (n: string) => {
    const index = order.findIndex((o) => lower(o) === lower(n));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const sorted = (list: string[]) => [...list].sort((a, b) => rank(a) - rank(b) || byName(a, b));
  return {
    ...draft,
    auto: sorted(next === "auto" ? [...without(draft.auto), name] : without(draft.auto)),
    ask: sorted(next === "ask" ? [...without(draft.ask), name] : without(draft.ask)),
  };
}

export function toggleRole(draft: CampaignDraft, role: JobType): CampaignDraft {
  const roles = draft.roles.includes(role) ? draft.roles.filter((r) => r !== role) : [...draft.roles, role];
  return { ...draft, roles };
}

export type DraftField = "roles" | "autoCompanies" | "askFirstCompanies" | "resumeId" | "weeklyCap" | "minMatch" | "endsOn";
export type DraftResult = { ok: true; rules: CampaignRules } | { ok: false; errors: Partial<Record<DraftField, string>> };

const FRIENDLY: Partial<Record<DraftField, string>> = {
  weeklyCap: `Pick ${WEEKLY_CAP_MIN} to ${WEEKLY_CAP_MAX} a week.`,
  minMatch: `Pick ${MIN_MATCH_MIN} to ${MIN_MATCH_MAX}.`,
  endsOn: "Pick an end date.",
};

const toNumber = (value: string): number => (value.trim() === "" ? Number.NaN : Number(value));

export function draftToRules(draft: CampaignDraft): DraftResult {
  const parsed = CampaignRulesSchema.safeParse({
    roles: draft.roles,
    autoCompanies: draft.auto,
    askFirstCompanies: draft.ask,
    resumeId: draft.resumeId,
    weeklyCap: toNumber(draft.weeklyCap),
    minMatch: toNumber(draft.minMatch),
    endsOn: draft.endsOn,
  });
  if (parsed.success) return { ok: true, rules: parsed.data };
  const errors: Partial<Record<DraftField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as DraftField;
    if (!errors[field]) errors[field] = FRIENDLY[field] ?? issue.message;
  }
  return { ok: false, errors };
}

export interface ApproveContext {
  inForce: CampaignRules | null;
  pending: CampaignRules | null;
  minEndsOn: string;
}

export interface ApproveState {
  canApprove: boolean;
  canSave: boolean;
  /** The form differs from the version in force (shows the "You changed the rules" banner). */
  changed: boolean;
  label: string;
}

export function approveState(draft: CampaignDraft, ctx: ApproveContext): ApproveState {
  const result = draftToRules(draft);
  const rules = result.ok ? result.rules : null;
  const complete = Boolean(rules && rules.roles.length > 0 && rules.autoCompanies.length > 0 && rules.endsOn >= ctx.minEndsOn);
  const changed = Boolean(ctx.inForce) && !rulesEqual(rules, ctx.inForce);
  const differsFromInForce = !ctx.inForce || changed;
  return {
    canApprove: complete && differsFromInForce,
    canSave: Boolean(rules) && differsFromInForce && !rulesEqual(rules, ctx.pending),
    changed,
    label: ctx.inForce ? "Approve new rules" : "Approve campaign",
  };
}
