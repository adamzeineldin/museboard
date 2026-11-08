import path from "node:path";

// Throwaway SQLite database used by one Vitest run. Each run (keyed by the Vitest main process id) gets its
// own directory, so two runs at the same time cannot recreate each other's database mid-test.
// Created by the global setup and removed by its teardown.
export const TEST_DB_ROOT = path.resolve(process.cwd(), ".test-db");
export const TEST_DB_DIR = path.join(TEST_DB_ROOT, `run-${process.pid}`);
export const TEST_DB_FILE = path.join(TEST_DB_DIR, "test.db");
export const TEST_DATABASE_URL = `file:${TEST_DB_FILE}`;
export const TEST_MAIL_DIR = path.join(TEST_DB_DIR, "mail");
