import { expect, test } from "@playwright/test";
import { signUpAndOnboard, uniqueEmail } from "./support/auth";
import { expectNoAxeViolations } from "./support/axe";

// A brand-new user with no resume, no contacts and no campaign: every signed-in page must render its empty
// state (no crash), keep one h1 and a main landmark, and pass axe (WCAG 2.1 AA) in light and dark.

const PAGES = [
  { path: "/jobs", h1: /open roles?/ },
  { path: "/campaign", h1: "Internship campaign" },
  { path: "/activity", h1: "Activity" },
  { path: "/warm-paths", h1: "Warm paths" },
  { path: "/settings", h1: "Settings" },
] as const;

test("empty signed-in pages render, keep their landmarks and pass axe in light and dark", async ({ page }) => {
  await signUpAndOnboard(page, uniqueEmail("a11y"));
  for (const { path, h1 } of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expectNoAxeViolations(page, path);
  }
});

test("the skip link is the first tab stop and moves focus to the main content", async ({ page }) => {
  await signUpAndOnboard(page, uniqueEmail("skip"));
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("signed-out pages pass axe too", async ({ page }) => {
  for (const path of ["/signin", "/not-a-real-page"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectNoAxeViolations(page, path);
  }
});

test("the connector scope radios keep their natural size instead of stretching across the row", async ({ page }) => {
  await signUpAndOnboard(page, uniqueEmail("radio"));
  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/settings");
    const readOnly = page.getByRole("radio", { name: /^Read only/ });
    await expect(readOnly).toBeVisible();
    const box = await readOnly.boundingBox();
    expect(box, `radio box at ${viewport.width}px`).not.toBeNull();
    expect(box?.width ?? Infinity, `radio width at ${viewport.width}px`).toBeLessThan(30);
  }
});
