import { z } from "zod";
import { outreachKindSchema } from "@/lib/types";

// Validation for contacts and outreach inputs. Pure (no DB) so CSV parsing and server actions share it.

export const NAME_MAX = 120;
export const ROLE_MAX = 120;
export const COMPANY_MAX = 120;
export const RELATIONSHIP_MAX = 120;
export const NOTES_MAX = 500;
export const EMAIL_MAX = 254;

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .optional()
    .transform((value) => value ?? "");

const nullableText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const emailField = z
  .string()
  .trim()
  .max(EMAIL_MAX, "Email doesn't look right")
  .optional()
  .nullable()
  .transform((value) => (value ? value : null))
  .pipe(z.email("Email doesn't look right").nullable());

/** Fields a person can type for one contact (manual form or one CSV row). */
export const contactFieldsSchema = z.object({
  name: requiredText("Name", NAME_MAX),
  role: optionalText("Role", ROLE_MAX),
  company: requiredText("Company", COMPANY_MAX),
  relationship: optionalText("Relationship", RELATIONSHIP_MAX),
  email: emailField,
  notes: nullableText("Notes", NOTES_MAX),
});

export type ContactFields = z.output<typeof contactFieldsSchema>;
export type ContactFieldsInput = z.input<typeof contactFieldsSchema>;

/** Sources a user can pick for an import. Manual entry is its own path. */
export const IMPORT_SOURCES = ["csv", "alumni-list"] as const;
export const importSourceSchema = z.enum(IMPORT_SOURCES, { error: "Pick where this list came from" });
export type ImportSource = z.infer<typeof importSourceSchema>;

const id = z.string().trim().min(1).max(200);

export const draftRequestSchema = z.object({
  contactId: id,
  kind: outreachKindSchema,
  jobId: id.optional(),
});

export const markSentSchema = z.object({
  outreachId: id,
  sent: z.boolean(),
});
