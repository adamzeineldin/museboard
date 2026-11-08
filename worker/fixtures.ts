// Test builders for scraper run JSON (the contract in scraper/models.py). Used only by worker/*.test.ts.

export interface RawJob {
  id: string;
  company: string;
  ats: string;
  title: string;
  location: string | null;
  type: string | null;
  posted_at: string | null;
  url: string;
  source: string;
  description_text: string;
  compensation: string | null;
  department: string | null;
}

export interface RawCompany {
  company: string;
  ats: string;
  ok: boolean;
  error: string | null;
  jobs: RawJob[];
}

export interface RawRun {
  run_at: string;
  companies: RawCompany[];
}

export const RUN_AT = "2026-11-07T12:00:00Z";

export function rawJob(postingId: string, overrides: Partial<RawJob> = {}): RawJob {
  return {
    id: `greenhouse:stripe:${postingId}`,
    company: "Stripe",
    ats: "greenhouse",
    title: `Software Engineer Intern ${postingId}`,
    location: "New York",
    type: "intern",
    posted_at: "2026-11-01T09:30:00Z",
    url: `https://boards.greenhouse.io/stripe/jobs/${postingId}`,
    source: "Greenhouse feed",
    description_text: "Build payments APIs.",
    compensation: "$55/hr",
    department: "Engineering",
    ...overrides,
  };
}

export function okCompany(jobs: RawJob[], overrides: Partial<RawCompany> = {}): RawCompany {
  return { company: "Stripe", ats: "greenhouse", ok: true, error: null, jobs, ...overrides };
}

export function failedCompany(company: string, ats: string, error = "HTTP 503 from board"): RawCompany {
  return { company, ats, ok: false, error, jobs: [] };
}

export function rawRun(companies: RawCompany[], runAt: string = RUN_AT): RawRun {
  return { run_at: runAt, companies };
}
