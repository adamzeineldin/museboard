import type { Company, Job, Resume, User } from "@/generated/prisma/client";
import { approveVersion, proposeVersion } from "@/lib/campaign";
import type { CampaignRules } from "@/lib/types";
import { createTestUser, db } from "@/test/db";

// Test-only fixtures for the applications service (imported by *.test.ts files only).

/** Tuesday 2026-11-10 10:00 in New York. The ISO week started Monday 2026-11-09 05:00Z. */
export const NOW = new Date("2026-11-10T15:00:00Z");
export const FAR_FUTURE = "2099-12-31";

export interface World {
  user: User;
  resume: Resume;
  companies: Record<string, Company>;
  jobs: Record<string, Job>;
}

const COMPANY_NAMES = ["Stripe", "Datadog", "Cloudflare", "Ramp", "Palantir", "Meta"] as const;

interface JobSpec {
  key: string;
  company: (typeof COMPANY_NAMES)[number];
  type?: "intern" | "newgrad";
  score: number | null;
  closed?: boolean;
}

const DEFAULT_JOBS: JobSpec[] = [
  { key: "stripe", company: "Stripe", score: 91 },
  { key: "datadog", company: "Datadog", score: 84 },
  { key: "cloudflare", company: "Cloudflare", score: 81 },
  { key: "ramp", company: "Ramp", score: 79 },
  { key: "palantir", company: "Palantir", score: 88 },
  { key: "meta", company: "Meta", score: 88 },
  { key: "rampNewgrad", company: "Ramp", type: "newgrad", score: 90 },
  { key: "stripeLow", company: "Stripe", score: 60 },
];

let seq = 0;

export async function createWorld(options: { jobs?: JobSpec[]; timezone?: string; withResume?: boolean } = {}): Promise<World> {
  seq += 1;
  const user = await createTestUser({ timezone: options.timezone ?? "America/New_York", name: "Ada Lovelace" });
  const resume =
    options.withResume === false
      ? (null as unknown as Resume)
      : await db.resume.create({
          data: { userId: user.id, filename: "Resume_v3.pdf", storageKey: `k${seq}`, parsedText: "python go", isDefault: true },
        });
  const companies: Record<string, Company> = {};
  for (const name of COMPANY_NAMES) {
    companies[name] = await db.company.upsert({ where: { name }, create: { name }, update: {} });
  }
  const jobs: Record<string, Job> = {};
  for (const [index, spec] of (options.jobs ?? DEFAULT_JOBS).entries()) {
    const job = await db.job.create({
      data: {
        id: `test:${seq}:${spec.key}`,
        companyId: companies[spec.company].id,
        title: `${spec.company} SWE ${spec.type === "newgrad" ? "New Grad" : "Intern"} ${spec.key}`,
        location: "New York",
        type: spec.type ?? "intern",
        url: `https://jobs.example.com/${seq}/${spec.key}`,
        source: "greenhouse",
        description: "Python and Go",
        firstSeenAt: new Date(NOW.getTime() - (index + 1) * 60_000),
        closedAt: spec.closed ? NOW : null,
      },
    });
    if (spec.score !== null) {
      await db.match.create({ data: { userId: user.id, jobId: job.id, score: spec.score, reasons: [] } });
    }
    jobs[spec.key] = job;
  }
  return { user, resume, companies, jobs };
}

export function baseRules(world: World, overrides: Partial<CampaignRules> = {}): CampaignRules {
  return {
    roles: ["intern"],
    autoCompanies: ["Stripe", "Datadog", "Cloudflare", "Ramp"],
    askFirstCompanies: ["Meta"],
    resumeId: world.resume.id,
    weeklyCap: 5,
    minMatch: 75,
    endsOn: FAR_FUTURE,
    ...overrides,
  };
}

/** Propose and approve rules. Pass `now` when the rules hold a fixed endsOn, so the fixture never expires. */
export async function approveRules(world: World, overrides: Partial<CampaignRules> = {}, now: Date = new Date()) {
  const version = await proposeVersion(world.user.id, baseRules(world, overrides), "web", now);
  return approveVersion(world.user.id, version.id, "web", now);
}

export async function auditFor(userId: string, action: string) {
  return db.auditEvent.findMany({ where: { userId, action }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}
