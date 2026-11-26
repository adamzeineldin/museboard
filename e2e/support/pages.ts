import { expect, type Locator, type Page } from "@playwright/test";

// Small page helpers shared by the journey specs.

/** The job card for a company (seed data has one open role per company). */
export function jobCard(page: Page, company: string): Locator {
  return page.locator("article.job").filter({ has: page.locator(".job-top .font-bold", { hasText: new RegExp(`^${company}$`) }) });
}

/** The rule-check / application status chip on a job card (the first chip). */
export function statusChip(page: Page, company: string): Locator {
  return jobCard(page, company).locator(".job-foot .chips .chip").first();
}

/** An Activity row by company name. */
export function activityRow(page: Page, company: string): Locator {
  return page
    .getByRole("region", { name: "Applications" })
    .getByRole("listitem")
    .filter({ has: page.locator(".t", { hasText: new RegExp(`^${company} · `) }) });
}

/** The company toggle in the campaign rules (accessible name "<Company>: <state>"). */
export function companyToggle(page: Page, company: string): Locator {
  return page.getByRole("region", { name: "Campaign rules" }).getByRole("button", { name: new RegExp(`^${company}\\s*:`) });
}

/** Cycle a company toggle with the keyboard (Space) until it reads the wanted state. */
export async function setCompany(page: Page, company: string, state: "auto-apply" | "ask me first" | "skip"): Promise<void> {
  const toggle = companyToggle(page, company);
  for (let i = 0; i < 3; i += 1) {
    if ((await toggle.textContent())?.includes(state)) return;
    await toggle.focus();
    await page.keyboard.press("Space");
  }
  await expect(toggle).toContainText(state);
}

/** Wait for a toast/status message (polite or assertive live region). */
export async function expectAnnouncement(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: text }).first()).toBeAttached();
}
