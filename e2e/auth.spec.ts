import { expect, test, type APIRequestContext } from "@playwright/test";
import { readMagicLink as readLink } from "./support/auth";

// API-level magic-link flow (no browser needed): request link -> read the run's mail dir -> follow -> onboarding.

async function requestMagicLink(request: APIRequestContext, email: string) {
  const csrf = await request.get("/api/auth/csrf");
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  return request.post("/api/auth/signin/nodemailer", {
    form: { email, csrfToken, callbackUrl: "/jobs" },
    maxRedirects: 0,
  });
}

test("signed-out visitors are sent to sign in", async ({ request }) => {
  const response = await request.get("/campaign", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/signin?callbackUrl=%2Fcampaign");
});

test("magic link signs a new user in and lands them on onboarding", async ({ request }) => {
  const email = `e2e-${Date.now()}@inroad.test`;
  const sent = await requestMagicLink(request, email);
  expect(sent.status()).toBe(302);
  // Auth.js sends you to its verify-request route, which redirects to our page.
  const checkEmail = await request.get(sent.headers().location ?? "");
  expect(checkEmail.url()).toContain("/signin/check-email");
  expect(await checkEmail.text()).toContain("Check your email");

  const link = await readLink(email);
  expect(link).toContain("/api/auth/callback/nodemailer");

  const landed = await request.get(link);
  expect(landed.ok()).toBe(true);
  expect(landed.url()).toContain("/onboarding");
  expect(await landed.text()).toContain("Welcome to Inroad");

  // The app shell itself sends incomplete profiles back to onboarding.
  const jobs = await request.get("/jobs", { maxRedirects: 0 });
  expect([303, 307]).toContain(jobs.status());
  expect(jobs.headers().location).toContain("/onboarding");
});
