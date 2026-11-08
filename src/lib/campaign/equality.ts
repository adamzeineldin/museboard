import { normalizeCompanyName } from "@/lib/company-name";
import type { CampaignRules } from "@/lib/types";

// Pure: do two rule sets mean the same thing? List order, company-name case and spacing don't matter.

const normList = (values: readonly string[]): string =>
  [...new Set(values.map(normalizeCompanyName))].sort().join("\u0000");

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
