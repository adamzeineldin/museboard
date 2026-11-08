import { z } from "zod";

// Packets handed to the user (web) or to Muse (submit_application / draft_outreach).
// Pure types + zod schemas, no server-only, so client components can render them.
// Shapes: docs/ARCHITECTURE.md "Packets".

export const PacketRoleSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  url: z.string(),
});

export const PacketResumeSchema = z.object({
  id: z.string(),
  filename: z.string(),
  downloadPath: z.string(),
});

export const FitSummarySchema = z.tuple([z.string(), z.string(), z.string()]);

export const ReferralPacketSchema = z.object({
  role: PacketRoleSchema.nullable(),
  fitSummary: FitSummarySchema,
  resume: PacketResumeSchema.nullable(),
});

export const ApplicationAnswersSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  school: z.string(),
  gradYear: z.number().int().nullable(),
  location: z.string().optional(),
});

export const ApplicationPacketSchema = ReferralPacketSchema.extend({
  applyUrl: z.string(),
  answers: ApplicationAnswersSchema,
  tailoredSummary: z.string(),
  /** Fields Inroad cannot answer (e.g. work authorization): the user or Muse must ask. */
  notes: z.array(z.string()),
});

export type PacketRole = z.infer<typeof PacketRoleSchema>;
export type PacketResume = z.infer<typeof PacketResumeSchema>;
export type FitSummary = z.infer<typeof FitSummarySchema>;
export type ReferralPacket = z.infer<typeof ReferralPacketSchema>;
export type ApplicationAnswers = z.infer<typeof ApplicationAnswersSchema>;
export type ApplicationPacket = z.infer<typeof ApplicationPacketSchema>;

/** Parse a packet stored as JSON (Application.packet). Returns null when it doesn't validate. */
export function parseApplicationPacket(value: unknown): ApplicationPacket | null {
  const result = ApplicationPacketSchema.safeParse(value);
  return result.success ? result.data : null;
}
