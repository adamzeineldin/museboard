import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { TEST_DATABASE_URL, TEST_DB_DIR } from "./constants";

// Recreate the throwaway test database and push the current schema into it.
export default function setup(): void {
  rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });
  const prismaBin = path.resolve(process.cwd(), "node_modules", ".bin", "prisma");
  try {
    execFileSync(prismaBin, ["db", "push"], {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? "";
    throw new Error(`Failed to push the Prisma schema to the test database:\n${stderr}`);
  }
}
