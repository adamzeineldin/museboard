import type { CampaignRules } from "@/lib/types";

// Pure: do two rule sets mean the same thing? List order and company-name case don't matter.

const normList = (values: readonly string[]): string =>
  [...new Set(values.map((value) => value.trim().toLowerCase()))].sort().join("\u0000");

function canonical(rules: CampaignRules): string {
  return JSON.stringify([
    normList(rules.roles),
    normList(rules.autoCompanies),
    normList(rules.askFirstCompanies),
    rules.resumeId,
    rules.weeklyCap,
    rules.minMatch,
    rules.endsOn,
  ]);
}

export function rulesEqual(a: CampaignRules | null, b: CampaignRules | null): boolean {
  if (!a || !b) return a === b;
  return canonical(a) === canonical(b);
}
