import { expect, test, type Page } from "@playwright/test";
import { signUpAndOnboard, uniqueEmail } from "./support/auth";
import { expectNoAxeViolations } from "./support/axe";
import { RESUME_PDF } from "./support/env";
import { connectMuse, callTool } from "./support/mcp";
import { activityRow, companyToggle, jobCard, setCompany, statusChip } from "./support/pages";

// The done-criteria journey (brief sec. 9) for a brand-new user, in order, on one signed-in page.
// Seed scores against the PDF fixture: Datadog 80, Cloudflare 80, Palantir 78, Google 77, Stripe 76, Meta 76,
// Capital One 74, Ramp 71 (new grad). Campaign: auto Stripe/Datadog/Cloudflare/Capital One, Meta ask first,
// interns only, cap 2, min match 75.

const CHANGED_BANNER = "You changed the rules. Inroad keeps using the version you approved until you approve this one.";
const LIMIT = "Weekly limit reached";

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterAll(async () => {
  await page.context().close();
});

test("a new user signs up with the dev magic link and onboards", async () => {
  await signUpAndOnboard(page, uniqueEmail("journey"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/open roles?/);
  await expect(statusChip(page, "Stripe")).toHaveText("No approved campaign yet");
});

test("uploads a resume (PDF fixture) and sees match scores", async () => {
  await page.getByLabel("Resume file").setInputFiles(RESUME_PDF);
  await page.getByRole("button", { name: "Upload resume" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/new match/);
  await expect(jobCard(page, "Datadog").getByRole("img", { name: /% match/ })).toHaveAccessibleName("80% match, Good match");
});

test("approves a campaign and sees jobs labelled will auto-apply, referral first, or held with a reason", async () => {
  await page.goto("/campaign");
  for (const company of ["Stripe", "Datadog", "Cloudflare", "Capital One"]) await setCompany(page, company, "auto-apply");
  await setCompany(page, "Meta", "ask me first");
  await page.getByLabel("Per week, max").fill("2");
  await page.getByLabel("Min match %").fill("75");
  await expect(page.getByRole("region", { name: "What you're approving" })).toContainText("Meta");
  await page.getByRole("button", { name: "Approve campaign" }).click();
  await expect(page.getByRole("region", { name: "What you're approving" }).getByText("Active", { exact: true })).toBeVisible();

  await page.goto("/jobs");
  for (const company of ["Stripe", "Datadog", "Cloudflare"]) await expect(statusChip(page, company)).toHaveText("Will auto-apply");
  await expect(statusChip(page, "Meta")).toHaveText("Top choice: referral first");
  await expect(statusChip(page, "Capital One")).toHaveText("Match below 75%");
  await expect(statusChip(page, "Palantir")).toHaveText("Not on your company list");
  await expect(statusChip(page, "Ramp")).toHaveText("Not on your company list");
  await expectNoAxeViolations(page, "/jobs with a campaign");
});

test("editing the approved campaign shows the banner and changes nothing until it is re-approved", async () => {
  await page.goto("/campaign");
  await setCompany(page, "Palantir", "auto-apply");
  await expect(page.getByRole("note")).toHaveText(CHANGED_BANNER);
  await page.getByRole("button", { name: "Save without approving" }).click();
  await expect(page.getByText("They're pending until you do.")).toBeVisible();
  await expectNoAxeViolations(page, "/campaign with a pending version");

  await page.goto("/jobs");
  await expect(statusChip(page, "Palantir")).toHaveText("Not on your company list");
  await expect(statusChip(page, "Stripe")).toHaveText("Will auto-apply");

  await page.goto("/campaign");
  await expect(companyToggle(page, "Palantir")).toContainText("auto-apply");
  await page.getByRole("button", { name: "Approve new rules" }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.goto("/jobs");
  await expect(statusChip(page, "Palantir")).toHaveText("Will auto-apply");
});

test("runs the weekly pass on /activity: two cleared, the rest waiting on you", async () => {
  await page.goto("/activity");
  await page.getByRole("button", { name: "Run this week's pass" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Prepared 2. 3 waiting on you." })).toBeAttached();
  await expect(page.getByRole("list", { name: "Applications" }).getByRole("listitem")).toHaveCount(5);
  await expect(activityRow(page, "Meta")).toContainText("Top choice: referral first");
  await expect(page.getByRole("list", { name: "Applications" }).getByRole("listitem").filter({ hasText: LIMIT })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Mark as submitted: / })).toHaveCount(2);
});

test("approve over the cap: one campaign-prepared row is held with 'Weekly limit reached', on web and via Muse", async () => {
  const rows = page.getByRole("list", { name: "Applications" }).getByRole("listitem");
  const overCap = rows.filter({ hasText: LIMIT }).filter({ has: page.getByRole("button", { name: /^Approve / }) });
  const [approveTarget, skipTarget] = await Promise.all([overCap.nth(0).locator(".t").textContent(), overCap.nth(1).locator(".t").textContent()]);
  await page.getByRole("button", { name: `Approve ${approveTarget}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved. It's ready to submit." })).toBeAttached();

  const held = rows.filter({ has: page.getByText(`Held: ${LIMIT}`, { exact: true }) });
  await expect(held).toHaveCount(1);
  await expect(held.getByRole("button", { name: /Mark as submitted/ })).toHaveCount(0);
  await expect(held.getByText("View packet")).toHaveCount(0);
  const heldCompany = ((await held.locator(".t").textContent()) ?? "").split(" · ")[0];

  await page.getByRole("button", { name: `Skip ${skipTarget}` }).click();
  await expect(activityRow(page, (skipTarget ?? "").split(" · ")[0]).getByText("Skipped", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page, "/activity with rows");

  await page.goto("/jobs");
  await expect(statusChip(page, heldCompany)).toHaveText(`Held: ${LIMIT}`);
  await expect(statusChip(page, (approveTarget ?? "").split(" · ")[0])).toHaveText("Ready to submit");
});

test("opens a packet and marks a ready application submitted", async () => {
  await page.goto("/activity");
  const ready = page.getByRole("list", { name: "Applications" }).getByRole("listitem").filter({ has: page.getByText("Ready to submit", { exact: true }) }).first();
  await ready.getByText("View packet").click();
  await expect(ready.getByText("Inroad leaves these to you")).toBeVisible();
  await expect(ready.getByText(/Work authorization and visa sponsorship: Inroad never answers these/)).toBeVisible();
  await expect(ready.getByRole("link", { name: /^Open application for / })).toHaveAttribute("href", /^https:\/\//);
  await expect(ready.getByRole("link", { name: /^Download / })).toBeVisible();
  const name = (await ready.locator(".t").textContent()) ?? "";
  await page.getByRole("button", { name: `Mark as submitted: ${name}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked as submitted" })).toBeAttached();
  await expect(activityRow(page, name.split(" · ")[0])).toContainText("Applied");
});

test("warm paths: add a contact, draft an ask, copy it and mark it sent", async () => {
  await page.goto("/warm-paths");
  await expect(page.getByText("No contacts yet")).toBeVisible();
  await page.getByLabel("Name").fill("Marcus T.");
  await page.getByLabel("Role").fill("Production Engineer");
  await page.getByLabel("Company").fill("Meta");
  await page.getByLabel("How you know them").fill("Alum, class of 2023");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("list", { name: "Your contacts" })).toContainText("Marcus T.");

  // The only contact is selected for drafting right away.
  await expect(page.getByRole("link", { name: "Drafting ask to Marcus T." })).toHaveAttribute("aria-current", "true");
  const kinds = page.getByRole("group", { name: "Kind of message" });
  await kinds.getByRole("button", { name: /referral/i }).click();
  await expect(kinds.getByRole("button", { name: /referral/i })).toHaveAttribute("aria-pressed", "true");
  const draft = page.locator("#draft-text");
  await expect(draft).toContainText("Marcus");
  await expect(page.getByRole("heading", { name: /Referral ask to Marcus T\./i })).toBeVisible();

  await page.getByRole("button", { name: "Copy draft to Marcus T." }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeAttached();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.trim()).toBe(((await draft.innerText()) ?? "").trim());

  const sent = page.getByRole("button", { name: "Mark as sent: message to Marcus T." });
  await expect(sent).toHaveAttribute("aria-pressed", "false");
  await sent.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Sent by you", { exact: true })).toBeVisible();
  // The draft panel and the saved-drafts list both show the toggle for this draft.
  await expect(page.getByRole("button", { name: "Mark as sent: message to Marcus T." }).first()).toHaveAttribute("aria-pressed", "true");
  await expectNoAxeViolations(page, "/warm-paths with a draft");
});

test("settings: the weekly digest switch turns off and on", async () => {
  await page.goto("/settings");
  const digest = page.getByRole("switch", { name: /Weekly digest email/ });
  await expect(digest).toHaveAttribute("aria-checked", "true");
  await digest.click();
  await expect(page.getByRole("status").filter({ hasText: "Weekly digest is off." })).toBeVisible();
  await expect(page.getByRole("switch", { name: /Weekly digest email: Off/ })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: /Weekly digest email/ }).click();
  await expect(page.getByRole("switch", { name: /Weekly digest email: On/ })).toHaveAttribute("aria-checked", "true");
});

test("settings: a Muse connector token works with an MCP client, and Muse sees the same held verdict", async () => {
  await page.goto("/settings");
  await page.getByLabel("Connection name").fill("e2e Muse");
  await page.getByLabel(/Read and write/).check();
  await page.getByRole("button", { name: "Create access token" }).click();
  const token = await page.getByRole("textbox", { name: "Access token" }).inputValue();
  expect(token).toMatch(/^inr_[A-Za-z0-9_-]{20,}$/);
  await expectNoAxeViolations(page, "/settings with a token");

  const client = await connectMuse(new URL("/mcp", page.url()), token);
  try {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "approve_campaign",
      "draft_outreach",
      "find_roles",
      "find_warm_path",
      "get_campaign",
      "prepare_application",
      "propose_campaign",
      "record_submission",
      "run_weekly_pass",
      "submit_application",
    ]);
    const roles = await callTool(client, "find_roles");
    const rows = (roles.data.roles ?? []) as Array<{ company: string; status: string; reason: string; applicationId: string | null }>;
    const held = rows.filter((row) => row.reason === `Held: ${LIMIT}`);
    expect(held).toHaveLength(1);
    const refused = await callTool(client, "submit_application", { applicationId: held[0].applicationId });
    expect(refused).toMatchObject({ isError: true, text: `Inroad won't release this application: ${LIMIT}` });
  } finally {
    await client.close();
  }
});
