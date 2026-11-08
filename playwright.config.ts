import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// E2E runs `next dev` on a free port against a throwaway SQLite DB (db push + seed) in a temp dir, so it
// never touches dev.db, .dev-mail or uploads. Magic links and the resume store live in the same temp dir.
// No live network: the seed jobs are enough, and the scraper never runs. Needs `npx playwright install chromium`.
// The port and temp dir are chosen once in the runner process and inherited by the workers through env.

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("No port"))));
    });
  });
}

process.env.E2E_PORT ??= String(await freePort());
process.env.E2E_TMP_DIR ??= mkdtempSync(path.join(tmpdir(), "inroad-e2e-"));

const PORT = Number(process.env.E2E_PORT);
const TMP = process.env.E2E_TMP_DIR;
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_ENV = {
  DATABASE_URL: `file:${path.join(TMP, "e2e.db")}`,
  AUTH_URL: BASE_URL,
  APP_URL: BASE_URL,
  AUTH_SECRET: "e2e-only-secret-not-for-production-use-0123456789",
  EMAIL_SERVER: "",
  DEV_MAIL_DIR: path.join(TMP, "mail"),
  INROAD_STORAGE_DIR: path.join(TMP, "storage"),
  NEXT_TELEMETRY_DISABLED: "1",
  INROAD_E2E: "1",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? "github" : "list",
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx prisma db push && npx tsx prisma/seed.ts && npx next dev --port ${PORT}`,
    url: `${BASE_URL}/signin`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
    env: SERVER_ENV,
  },
});
