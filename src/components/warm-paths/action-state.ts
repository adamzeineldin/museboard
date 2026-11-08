import type { CsvDuplicate, CsvRowError } from "@/lib/outreach/csv";

// Shapes returned by the Warm paths server actions. Kept out of actions.ts because a "use server"
// module may only export async functions.

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export type ContactField = "name" | "role" | "company" | "relationship" | "email" | "notes";

export interface ContactFormState {
  status: "idle" | "ok" | "error";
  fieldErrors: Partial<Record<ContactField, string>>;
  formError: string | null;
  message: string | null;
  /** What was submitted, so the form keeps the user's input after React resets it. */
  values: Partial<Record<ContactField, string>>;
}

export const INITIAL_CONTACT_FORM: ContactFormState = { status: "idle", fieldErrors: {}, formError: null, message: null, values: {} };

export interface ImportReport {
  created: number;
  errors: CsvRowError[];
  duplicates: CsvDuplicate[];
}

export interface ImportState {
  status: "idle" | "ok" | "error";
  error: string | null;
  report: ImportReport | null;
}

export const INITIAL_IMPORT: ImportState = { status: "idle", error: null, report: null };

export const SESSION_ENDED = "Your session ended. Sign in again.";

/** One-line summary of an import for the toast and the report heading. */
export function importSummary(report: ImportReport): string {
  const parts = [`Imported ${report.created} contact${report.created === 1 ? "" : "s"}`];
  if (report.duplicates.length) parts.push(`skipped ${report.duplicates.length} already saved`);
  if (report.errors.length) parts.push(`${report.errors.length} ${report.errors.length === 1 ? "row needs" : "rows need"} fixing`);
  return `${parts.join(", ")}.`;
}
