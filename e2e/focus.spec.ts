import { expect, test, type Page } from "@playwright/test";
import { readMagicLink, signUpAndOnboard, uniqueEmail } from "./support/auth";
import { RESUME_PDF } from "./support/env";
import { activityRow, jobCard, setCompany } from "./support/pages";

// Keyboard and screen-reader behaviour that unit tests can't see: what keeps its value after an error, and where
// focus lands after an action removes the control that was pressed.

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterAll(async () => {
  await page.context().close();
});

test("onboarding keeps what you typed after an error and focuses the field to fix", async () => {
  const email = uniqueEmail("focus-onboarding");
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await readMagicLink(email));

  // Whitespace passes the browser's "required" check but not the server's, so the form comes back with an error.
  await page.getByLabel("Your name").fill("   ");
  await page.getByLabel("School").fill("State University");
  await page.getByLabel("Graduation year").selectOption("2027");
  await page.getByLabel("Time zone").selectOption("America/Chicago");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByLabel("Your name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Your name")).toBeFocused();
  await expect(page.getByLabel("School")).toHaveValue("State University");
  await expect(page.getByLabel("Graduation year")).toHaveValue("2027");
  await expect(page.getByLabel("Time zone")).toHaveValue("America/Chicago");
});

test("pressing Prepare with the keyboard never drops focus to the page", async () => {
  await page.context().clearCookies();
  await signUpAndOnboard(page, uniqueEmail("focus-prepare"));
  await page.getByLabel("Resume file").setInputFiles(RESUME_PDF);
  await page.getByRole("button", { name: "Upload resume" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/new match/);

  // No campaign yet: the result is held and the button stays, so focus stays on it.
  const stripe = jobCard(page, "Stripe");
  await stripe.getByRole("button", { name: /^Prepare / }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toContainText("Held for you");
  await expect(stripe.getByRole("button", { name: /^Prepare / })).toBeFocused();

  // With an approved campaign the job is prepared, the button goes away, and focus moves to the card heading.
  await page.goto("/campaign");
  await setCompany(page, "Cloudflare", "auto-apply");
  await page.getByRole("button", { name: "Approve campaign" }).click();
  await expect(page.getByRole("region", { name: "What you're approving" }).getByText("Active", { exact: true })).toBeVisible();
  await page.goto("/jobs");
  const cloudflare = jobCard(page, "Cloudflare");
  await cloudflare.getByRole("button", { name: /^Prepare / }).focus();
  await page.keyboard.press("Enter");
  await expect(cloudflare.getByRole("button", { name: /^Prepar/ })).toHaveCount(0);
  await expect(cloudflare.getByRole("heading", { level: 3 })).toBeFocused();
});

test("the Jobs toast stays while its link has focus", async () => {
  const link = page.locator(".toast").getByRole("link");
  await expect(link).toBeVisible();
  await link.focus();
  await page.waitForTimeout(8_000);
  await expect(link).toBeVisible();
});

test("approving on Activity with the keyboard keeps focus on that row", async () => {
  await page.goto("/activity");
  const row = activityRow(page, "Stripe");
  await row.getByRole("button", { name: /^Approve / }).focus();
  await page.keyboard.press("Enter");
  await expect(row.getByRole("button", { name: /^Approve / })).toHaveCount(0);
  await expect(row.locator(".t")).toBeFocused();
});
