import path from "node:path";

// Throwaway SQLite database used by every Vitest run. Recreated by the global setup.
export const TEST_DB_DIR = path.resolve(process.cwd(), ".test-db");
export const TEST_DB_FILE = path.join(TEST_DB_DIR, "test.db");
export const TEST_DATABASE_URL = `file:${TEST_DB_FILE}`;
