import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { User } from "@/generated/prisma/client";
import {
  BACKEND_INTERN_POSTING,
  FRONTEND_NEW_GRAD_POSTING,
  LONG_SWE_INTERN_POSTING,
  SALES_POSTING,
  SWE_INTERN_POSTING,
  SWE_RESUME,
} from "@/lib/matching/__fixtures__/texts";
import { localDateString } from "@/lib/rules";
import type { CampaignRules } from "@/lib/types";
import { createTestUser, db } from "@/test/db";

// A small, realistic world for the cross-module integration tests: six open jobs at six companies,
// two contacts at the ask-first company, and a SWE resume as plain text. Everything goes through the
// real modules; nothing of ours is mocked.

export const JOB_IDS = {
  stripe: "greenhouse:stripe:1",
  datadog: "greenhouse:datadog:2",
  cloudflare: "greenhouse:cloudflare:3",
  meta: "manual:meta:4",
  rampNewGrad: "ashby:ramp:5",
  sales: "lever:acme:6",
} as const;

interface JobSeed {
  id: string;
  company: string;
  ats: string | null;
  type: "intern" | "newgrad";
  posting: { title: string; description: string };
}

const JOBS: readonly JobSeed[] = [
  { id: JOB_IDS.stripe, company: "Stripe", ats: "greenhouse", type: "intern", posting: SWE_INTERN_POSTING },
  { id: JOB_IDS.datadog, company: "Datadog", ats: "greenhouse", type: "intern", posting: BACKEND_INTERN_POSTING },
  { id: JOB_IDS.cloudflare, company: "Cloudflare", ats: "greenhouse", type: "intern", posting: LONG_SWE_INTERN_POSTING },
  {
    id: JOB_IDS.meta,
    company: "Meta",
    ats: null,
    type: "intern",
    posting: { title: "Software Engineer Intern, 2027", description: SWE_INTERN_POSTING.description.replaceAll("Stripe", "Meta") },
  },
  { id: JOB_IDS.rampNewGrad, company: "Ramp", ats: "ashby", type: "newgrad", posting: FRONTEND_NEW_GRAD_POSTING },
  { id: JOB_IDS.sales, company: "Acme CRM", ats: "lever", type: "intern", posting: SALES_POSTING },
];

export const RESUME_TXT = new TextEncoder().encode(SWE_RESUME);

/** Seed companies and open jobs. Returns a company name -> id map. */
export async function seedJobs(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const job of JOBS) {
    const company =
      ids.get(job.company) ??
      (await db.company.create({ data: { name: job.company, ats: job.ats } })).id;
    ids.set(job.company, company);
    await db.job.create({
      data: {
        id: job.id,
        companyId: company,
        title: job.posting.title,
        description: job.posting.description,
        location: "New York, NY",
        type: job.type,
        url: `https://jobs.example.com/${encodeURIComponent(job.id)}`,
        source: job.ats ?? "manual",
      },
    });
  }
  return ids;
}

export async function newStudent(): Promise<User> {
  return createTestUser({ timezone: "America/New_York", name: "Jordan Lee", school: "State University", gradYear: 2027 });
}

/** The campaign rules the integration tests approve: three auto companies, Meta ask-first, cap 2. */
export function campaignRules(resumeId: string, now: Date): CampaignRules {
  const inSixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  return {
    roles: ["intern"],
    autoCompanies: ["Stripe", "Datadog", "Cloudflare", "Ramp"],
    askFirstCompanies: ["Meta"],
    resumeId,
    weeklyCap: 2,
    minMatch: 70,
    endsOn: localDateString(inSixtyDays, "America/New_York"),
  };
}

/** A private resume storage root per test file, removed by the returned cleanup. */
export function useTempStorage(): () => void {
  const dir = mkdtempSync(path.join(os.tmpdir(), "inroad-int-"));
  const previous = process.env.INROAD_STORAGE_DIR;
  process.env.INROAD_STORAGE_DIR = dir;
  return () => {
    if (previous === undefined) delete process.env.INROAD_STORAGE_DIR;
    else process.env.INROAD_STORAGE_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  };
}
