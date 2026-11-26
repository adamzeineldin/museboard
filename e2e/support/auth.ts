import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { mailDir } from "./env";

// Sign-up through the dev magic link: Auth.js writes the link to DEV_MAIL_DIR instead of emailing it.

export const uniqueEmail = (label: string): string => `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@inroad.test`;

const recipientFile = (email: string): string => path.join(mailDir(), `${email.toLowerCase().replace(/[^a-z0-9.-]/g, "_")}.txt`);

export async function readMagicLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const link = (await readFile(recipientFile(email), "utf8")).trim();
      if (link) return link;
    } catch {
      // not written yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No magic link was written for ${email}`);
}

export interface Profile {
  name: string;
  school: string;
  gradYear: string;
  timezone: string;
}

export const DEFAULT_PROFILE: Profile = { name: "Jordan Lee", school: "State University", gradYear: "2027", timezone: "America/New_York" };

/** A brand-new user: request a link, follow it, fill onboarding. Ends on /jobs. */
export async function signUpAndOnboard(page: Page, email: string, profile: Profile = DEFAULT_PROFILE): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto(await readMagicLink(email));
  await expect(page.getByRole("heading", { name: "Welcome to Inroad" })).toBeVisible();
  await page.getByLabel("Your name").fill(profile.name);
  await page.getByLabel("School").fill(profile.school);
  await page.getByLabel("Graduation year").selectOption(profile.gradYear);
  await page.getByLabel("Time zone").selectOption(profile.timezone);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/jobs");
}
