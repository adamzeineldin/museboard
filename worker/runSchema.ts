import { z } from "zod";
import { atsSchema, jobTypeSchema } from "@/lib/types";

// zod mirror of the scraper's JSON contract (scraper/models.py: Job.to_dict / CompanyResult.to_dict).
// Every object is strict: an unexpected key means the scraper and worker disagree, so the run is rejected.

const MAX_DESCRIPTION_CHARS = 8000; // scraper/text.py, counted in code points like Python's len()
const MAX_ERROR_CHARS = 500; // scraper/runner.py
const MAX_COMPANY_NAME = 120;
const MAX_TITLE = 500;
const MAX_SHORT_TEXT = 500;
const MAX_URL = 2048;
const UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function isRealUtcInstant(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().replace(".000Z", "Z") === value;
}

const utcTimestamp = z
  .string()
  .regex(UTC_SECONDS, "expected UTC 'YYYY-MM-DDTHH:MM:SSZ'")
  .refine(isRealUtcInstant, "not a real date/time");

const httpUrl = z.url({ protocol: /^https?$/ }).max(MAX_URL);

const SOURCES = ["Greenhouse feed", "Lever feed", "Ashby feed", "Workday feed"] as const;

export const scrapedJobSchema = z.strictObject({
  id: z.string().min(1).max(MAX_SHORT_TEXT),
  company: z.string().min(1).max(MAX_COMPANY_NAME),
  ats: atsSchema,
  title: z.string().min(1).max(MAX_TITLE),
  location: z.string().max(MAX_SHORT_TEXT).nullable(),
  type: jobTypeSchema.nullable(),
  posted_at: utcTimestamp.nullable(),
  url: httpUrl,
  source: z.enum(SOURCES),
  description_text: z
    .string()
    .refine((text) => [...text].length <= MAX_DESCRIPTION_CHARS, `at most ${MAX_DESCRIPTION_CHARS} characters`),
  compensation: z.string().max(MAX_SHORT_TEXT).nullable(),
  department: z.string().max(MAX_SHORT_TEXT).nullable(),
});

const companyResultSchema = z
  .strictObject({
    company: z.string().min(1).max(MAX_COMPANY_NAME),
    ats: atsSchema,
    ok: z.boolean(),
    error: z.string().max(MAX_ERROR_CHARS).nullable(),
    jobs: z.array(scrapedJobSchema),
  })
  .superRefine((result, ctx) => {
    if (result.ok && result.error !== null) {
      ctx.addIssue({ code: "custom", path: ["error"], message: "must be null when ok is true" });
    }
    if (!result.ok && (result.error === null || result.error.length === 0)) {
      ctx.addIssue({ code: "custom", path: ["error"], message: "is required when ok is false" });
    }
    if (!result.ok && result.jobs.length > 0) {
      ctx.addIssue({ code: "custom", path: ["jobs"], message: "must be empty when ok is false" });
    }
    result.jobs.forEach((job, index) => {
      if (job.company !== result.company || job.ats !== result.ats) {
        ctx.addIssue({ code: "custom", path: ["jobs", index], message: `belongs to ${job.company}/${job.ats}` });
      }
      if (!job.id.startsWith(`${result.ats}:`)) {
        ctx.addIssue({ code: "custom", path: ["jobs", index, "id"], message: `must start with "${result.ats}:"` });
      }
    });
  });

export const scraperRunSchema = z
  .strictObject({
    run_at: utcTimestamp,
    companies: z.array(companyResultSchema),
  })
  .superRefine((run, ctx) => {
    const seen = new Set<string>();
    run.companies.forEach((result, index) => {
      if (seen.has(result.company)) {
        ctx.addIssue({ code: "custom", path: ["companies", index, "company"], message: `duplicate company ${result.company}` });
      }
      seen.add(result.company);
    });
  });

export type ScrapedJob = z.infer<typeof scrapedJobSchema>;
export type CompanyResult = z.infer<typeof companyResultSchema>;
export type ScraperRun = z.infer<typeof scraperRunSchema>;
