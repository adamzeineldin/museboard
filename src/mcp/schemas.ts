import { z } from "zod";
import { APPLICATION_STATUSES, CAMPAIGN_STATUSES, JOB_TYPES, OUTREACH_KINDS } from "@/lib/types";

// Input and output schemas shared by the Inroad tools. Inputs are strict: unknown keys (a `userId`,
// for example) are rejected. Outputs use plain strings for dates (ISO 8601) so they serialize to JSON Schema.

const ID_MAX = 200;

export const idSchema = (what: string) =>
  z.string().trim().min(1, `${what} is required`).max(ID_MAX, `${what} is too long`);

export const companyNameSchema = z.string().trim().min(1, "company is required").max(120);

export const jobTypeInput = z.enum(JOB_TYPES);
export const outreachKindInput = z.enum(OUTREACH_KINDS);

export const isoString = z.string().describe("ISO 8601 timestamp");

/** Campaign rules as stored (output side: no transforms). */
export const RulesOutputSchema = z.object({
  roles: z.array(z.enum(JOB_TYPES)),
  autoCompanies: z.array(z.string()),
  askFirstCompanies: z.array(z.string()),
  resumeId: z.string(),
  weeklyCap: z.number().int(),
  minMatch: z.number().int(),
  endsOn: z.string(),
});

export const CampaignStatusOutput = z.enum([...CAMPAIGN_STATUSES, "none"]);
export const ApplicationStatusOutput = z.enum(APPLICATION_STATUSES);

export const ROLE_STATUSES = [
  "will_auto_apply",
  "referral_first",
  "held",
  "prepared",
  "waiting",
  "submitted",
  "skipped",
] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];
