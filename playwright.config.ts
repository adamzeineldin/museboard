import { defineConfig, devices } from "@playwright/test";

// E2E runs against `next dev` on port 3100 with its own SQLite file, so it never touches dev.db.
// Magic links are read from .dev-mail/ (EMAIL_SERVER is unset). Browser tests need
// `npx playwright install chromium` first; API-only specs (request fixture) run without browsers.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DATABASE_URL = "file:./.test-db/e2e.db";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `mkdir -p .test-db && npx prisma db push && npx next dev --port ${PORT}`,
    url: `${BASE_URL}/signin`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_URL: BASE_URL,
      APP_URL: BASE_URL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production-use-0123456789",
      EMAIL_SERVER: "",
    },
  },
});
