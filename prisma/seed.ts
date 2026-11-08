import "dotenv/config";
import { pathToFileURL } from "node:url";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/lib/prisma-client";
import { DEMO_USER, SEED_COMPANIES, SEED_CONTACTS, SEED_JOBS } from "./seed-data";

// Idempotent sample data: run as often as you like (`npm run db:seed`). Creates no campaign.

export interface SeedResult {
  userId: string;
  companies: number;
  jobs: number;
  contacts: number;
}

const HOUR_MS = 60 * 60 * 1000;

function jsonOrNull(value: Record<string, string> | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value;
}

async function seedCompanies(prisma: PrismaClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const company of SEED_COMPANIES) {
    const data = { ats: company.ats, atsConfig: jsonOrNull(company.atsConfig) };
    const row = await prisma.company.upsert({
      where: { name: company.name },
      create: { name: company.name, ...data },
      update: data,
    });
    ids.set(company.name, row.id);
  }
  return ids;
}

function companyId(ids: Map<string, string>, name: string): string {
  const id = ids.get(name);
  if (!id) throw new Error(`Seed data references unknown company "${name}"`);
  return id;
}

async function seedJobs(prisma: PrismaClient, companyIds: Map<string, string>, now: Date): Promise<void> {
  for (const job of SEED_JOBS) {
    const postedAt = new Date(now.getTime() - job.hoursAgo * HOUR_MS);
    const data = {
      companyId: companyId(companyIds, job.company),
      title: job.title,
      location: job.location,
      type: job.type,
      postedAt,
      url: job.url,
      source: job.source,
      description: job.description,
      compensation: job.compensation,
      department: job.department,
      closedAt: null,
    };
    await prisma.job.upsert({
      where: { id: job.id },
      create: { id: job.id, firstSeenAt: postedAt, ...data },
      update: data,
    });
  }
}

async function seedContacts(prisma: PrismaClient, userId: string, companyIds: Map<string, string>): Promise<void> {
  for (const contact of SEED_CONTACTS) {
    const data = {
      userId,
      companyId: companyId(companyIds, contact.company),
      name: contact.name,
      role: contact.role,
      relationship: contact.relationship,
      source: contact.source,
      notes: contact.notes,
    };
    await prisma.contact.upsert({ where: { id: contact.id }, create: { id: contact.id, ...data }, update: data });
  }
}

export async function seed(prisma: PrismaClient, now: Date = new Date()): Promise<SeedResult> {
  const companyIds = await seedCompanies(prisma);
  await seedJobs(prisma, companyIds, now);
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER.email },
    create: { ...DEMO_USER, emailVerified: now },
    update: { name: DEMO_USER.name, school: DEMO_USER.school, gradYear: DEMO_USER.gradYear, timezone: DEMO_USER.timezone },
  });
  await seedContacts(prisma, user.id, companyIds);
  return { userId: user.id, companies: SEED_COMPANIES.length, jobs: SEED_JOBS.length, contacts: SEED_CONTACTS.length };
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const result = await seed(prisma);
    console.info(
      `Seeded ${result.companies} companies, ${result.jobs} jobs and ${result.contacts} contacts for ${DEMO_USER.email}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  });
}
