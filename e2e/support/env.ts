import path from "node:path";

/** The run's temp dir (set by playwright.config.ts). */
export function e2eDir(): string {
  const dir = process.env.E2E_TMP_DIR;
  if (!dir) throw new Error("E2E_TMP_DIR is not set: run through `npm run e2e`.");
  return dir;
}

export const mailDir = (): string => path.join(e2eDir(), "mail");

export const RESUME_PDF = path.resolve(import.meta.dirname, "../../src/lib/resume/__fixtures__/resume.pdf");
