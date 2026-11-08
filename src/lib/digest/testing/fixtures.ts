import type { Campaign, User } from "@/generated/prisma/client";
import { approveVersion, getCampaignState, proposeVersion } from "@/lib/campaign";
import type { ApplicationStatus } from "@/lib/types";
import { createTestUser, db } from "@/test/db";

// Test-only fixtures for the digest. Campaigns go through the real campaign service; applications and
// outreach rows are written directly so a test can place them at exact instants.

export const SECRET = "digest-test-secret-0123456789";
export const BASE_URL = "https://inroad.test";
export const LINK_CONFIG = { secret: SECRET, baseUrl: BASE_URL } as const;
/** Monday 13:00 UTC, when the worker's DIGEST_CRON fires. */
export const MONDAY = new Date("2026-11-09T13:00:00Z");

export interface DigestWorld {
  user: User;
  resumeId: string;
  companyId: (name: string) => Promise<string>;
}

export async function newDigestWorld(overrides: Parameters<typeof createTestUser>[0] = {}): Promise<DigestWorld> {
  const user = await createTestUser({ name: "Jordan Lee", timezone: "America/New_York", ...overrides });
  const resume = await db.resume.create({
    data: { userId: user.id, filename: "jordan.txt", storageKey: `test/${user.id}.txt`, parsedText: "Python", isDefault: true },
  });
  const companyId = async (name: string): Promise<string> =>
    (await db.company.upsert({ where: { name }, create: { name, ats: "greenhouse" }, update: {} })).id;
  return { user, resumeId: resume.id, companyId };
}

export async function approvedCampaign(world: DigestWorld, now: Date = MONDAY): Promise<Campaign> {
  const rules = {
    roles: ["intern" as const],
    autoCompanies: ["Stripe", "Datadog"],
    askFirstCompanies: ["Meta"],
    resumeId: world.resumeId,
    weeklyCap: 5,
    minMatch: 70,
    endsOn: "2026-12-15",
  };
  const version = await proposeVersion(world.user.id, rules, "web", new Date(now.getTime() - 86_400_000 * 10));
  await approveVersion(world.user.id, version.id, "web", new Date(now.getTime() - 86_400_000 * 10));
  const { campaign } = await getCampaignState(world.user.id);
  if (!campaign) throw new Error("campaign was not created");
  return campaign;
}

let jobCounter = 0;

export interface AppSeed {
  company: string;
  title: string;
  status: ApplicationStatus;
  reason?: string;
  submittedAt?: Date;
  decidedAt?: Date;
}

export async function seedApplication(world: DigestWorld, seed: AppSeed): Promise<string> {
  jobCounter += 1;
  const job = await db.job.create({
    data: {
      id: `greenhouse:${seed.company.toLowerCase()}:${jobCounter}`,
      companyId: await world.companyId(seed.company),
      title: seed.title,
      location: "Remote",
      type: "intern",
      url: `https://jobs.example.com/${jobCounter}`,
      source: "greenhouse",
    },
  });
  const app = await db.application.create({
    data: {
      userId: world.user.id,
      jobId: job.id,
      resumeId: world.resumeId,
      status: seed.status,
      decidedBy: "campaign",
      reason: seed.reason ?? "Fits campaign rules",
      submittedAt: seed.submittedAt ?? null,
      decidedAt: seed.decidedAt ?? null,
    },
  });
  return app.id;
}

export async function seedReferralDraft(world: DigestWorld, contactName: string, company: string, createdAt: Date): Promise<void> {
  const companyId = await world.companyId(company);
  const contact = await db.contact.create({
    data: { userId: world.user.id, name: contactName, role: "Engineer", companyId, relationship: "Alum", source: "manual" },
  });
  await db.outreach.create({
    data: { userId: world.user.id, contactId: contact.id, companyId, kind: "referral_ask", draft: "Hi!", createdAt },
  });
}
