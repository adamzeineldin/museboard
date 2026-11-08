import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// Remove the throwaway DB, mail and resume store created for this run (only ever a dir under the OS temp dir).
export default async function globalTeardown(): Promise<void> {
  const dir = process.env.E2E_TMP_DIR;
  if (dir && dir.startsWith(tmpdir()) && dir.includes("inroad-e2e-")) await rm(dir, { recursive: true, force: true });
}
