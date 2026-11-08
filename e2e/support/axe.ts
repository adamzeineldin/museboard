import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// WCAG 2.1 A + AA rules (plus axe best practices such as one h1 and landmarks), run in light and dark.
// target-size (WCAG 2.2 2.5.8, 24x24 CSS px) is switched on as well: the brief asks for 24px touch targets.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const EXTRA_RULES = ["target-size"];

type Scheme = "light" | "dark";

function summarize(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]): string[] {
  return violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
        .map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").replace(/\s+/g, " ")}`)
        .slice(0, 5)
        .join("\n    ")}`,
  );
}

export async function expectNoAxeViolations(page: Page, label: string, schemes: readonly Scheme[] = ["light", "dark"]): Promise<void> {
  for (const scheme of schemes) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    // Let the scheme change settle (CSS variables only, no re-render needed).
    await page.waitForFunction((s) => matchMedia(`(prefers-color-scheme: ${s})`).matches, scheme);
    const results = await new AxeBuilder({ page })
      .withTags(TAGS)
      .options({ rules: Object.fromEntries(EXTRA_RULES.map((id) => [id, { enabled: true }])) })
      .analyze();
    expect(summarize(results.violations), `${label} (${scheme})`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
}
