import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { TEST_DATABASE_URL, TEST_DB_DIR } from "./constants";

// Create this run's throwaway test database, push the current schema into it, and remove it afterwards.
export default function setup(): () => void {
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
  return () => rmSync(TEST_DB_DIR, { recursive: true, force: true });
}
