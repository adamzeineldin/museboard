import { z } from "zod";

// Enum-like fields are plain Strings in the database (portable between SQLite and Postgres).
// These unions and schemas are the single source of truth for their allowed values.

export const JOB_TYPES = ["intern", "newgrad"] as const;
export const ATS_PROVIDERS = ["greenhouse", "lever", "ashby", "workday"] as const;
export const CAMPAIGN_STATUSES = ["active", "paused", "revoked", "ended"] as const;
export const APPROVED_VIA = ["web", "muse"] as const;
export const APPLICATION_STATUSES = ["prepared", "waiting", "submitted", "skipped"] as const;
export const DECIDED_BY = ["campaign", "user"] as const;
export const CONTACT_SOURCES = ["manual", "csv", "alumni-list"] as const;
export const OUTREACH_KINDS = ["coffee_chat", "referral_ask"] as const;
export const OUTREACH_STATUSES = ["draft", "sent_by_user"] as const;
export const ACTORS = ["user", "inroad", "muse"] as const;
export const CONNECTOR_SCOPES = ["read", "write"] as const;

export const jobTypeSchema = z.enum(JOB_TYPES);
export const atsSchema = z.enum(ATS_PROVIDERS);
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const approvedViaSchema = z.enum(APPROVED_VIA);
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export const decidedBySchema = z.enum(DECIDED_BY);
export const contactSourceSchema = z.enum(CONTACT_SOURCES);
export const outreachKindSchema = z.enum(OUTREACH_KINDS);
export const outreachStatusSchema = z.enum(OUTREACH_STATUSES);
export const actorSchema = z.enum(ACTORS);
export const connectorScopeSchema = z.enum(CONNECTOR_SCOPES);

export type JobType = z.infer<typeof jobTypeSchema>;
export type Ats = z.infer<typeof atsSchema>;
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type ApprovedVia = z.infer<typeof approvedViaSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export type DecidedBy = z.infer<typeof decidedBySchema>;
export type ContactSource = z.infer<typeof contactSourceSchema>;
export type OutreachKind = z.infer<typeof outreachKindSchema>;
export type OutreachStatus = z.infer<typeof outreachStatusSchema>;
export type Actor = z.infer<typeof actorSchema>;
export type ConnectorScope = z.infer<typeof connectorScopeSchema>;

// ---------------------------------------------------------------------------
// Campaign rules (brief sec. 3)
// ---------------------------------------------------------------------------

export const WEEKLY_CAP_MIN = 1;
export const WEEKLY_CAP_MAX = 20;
export const MIN_MATCH_MIN = 50;
export const MIN_MATCH_MAX = 100;
const MAX_COMPANIES = 200;
const MAX_COMPANY_NAME = 120;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

const companyListSchema = z
  .array(z.string().trim().min(1, "Company name is required").max(MAX_COMPANY_NAME))
  .max(MAX_COMPANIES)
  .transform(unique);

export const CampaignRulesSchema = z
  .strictObject({
    roles: z.array(jobTypeSchema).min(1, "Pick at least one role type").transform(unique),
    autoCompanies: companyListSchema,
    askFirstCompanies: companyListSchema,
    resumeId: z.string().trim().min(1, "Pick a resume"),
    weeklyCap: z.number().int().min(WEEKLY_CAP_MIN).max(WEEKLY_CAP_MAX),
    minMatch: z.number().int().min(MIN_MATCH_MIN).max(MIN_MATCH_MAX),
    endsOn: z.string().refine(isIsoCalendarDate, "Use a real date in YYYY-MM-DD form"),
  })
  .superRefine((rules, ctx) => {
    const auto = new Set(rules.autoCompanies.map((name) => name.toLowerCase()));
    const overlap = rules.askFirstCompanies.filter((name) => auto.has(name.toLowerCase()));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["askFirstCompanies"],
        message: `A company can't be both auto-apply and ask first: ${overlap.join(", ")}`,
      });
    }
  });

export type CampaignRules = z.output<typeof CampaignRulesSchema>;
export type CampaignRulesInput = z.input<typeof CampaignRulesSchema>;

/** Parse rules stored as JSON (e.g. CampaignVersion.rules). Returns null when they don't validate. */
export function parseCampaignRules(value: unknown): CampaignRules | null {
  const result = CampaignRulesSchema.safeParse(value);
  return result.success ? result.data : null;
}
