import { z } from "zod";

// Free-form instructions the user writes for Muse (Meta's cloud agent). Inroad stores them and hands them to
// Muse through the get_campaign tool; it never runs them through a model of its own.

export const MUSE_INSTRUCTIONS_MAX = 2000;

/** Trimmed text, or null when the box is empty. Line breaks are kept; other control characters are dropped. */
export const museInstructionsSchema = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+\n/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim())
  .pipe(z.string().max(MUSE_INSTRUCTIONS_MAX, `Keep it under ${MUSE_INSTRUCTIONS_MAX} characters.`))
  .transform((value) => (value === "" ? null : value));

export type MuseInstructions = z.infer<typeof museInstructionsSchema>;
