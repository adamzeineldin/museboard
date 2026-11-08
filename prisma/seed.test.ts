import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../src/test/db";
import { seed } from "./seed";
import { DEMO_USER, SEED_JOBS } from "./seed-data";

describe("prisma seed", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates the prototype companies, jobs, demo user and contacts, and no campaign", async () => {
    const result = await seed(db, new Date("2026-11-07T12:00:00Z"));
    expect(result).toMatchObject({ companies: 8, jobs: 8, contacts: 4 });

    const companies = await db.company.findMany({ orderBy: { name: "asc" } });
    expect(companies.map((c) => [c.name, c.ats])).toEqual([
      ["Capital One", "workday"],
      ["Cloudflare", "greenhouse"],
      ["Datadog", "greenhouse"],
      ["Google", null],
      ["Meta", null],
      ["Palantir", "lever"],
      ["Ramp", "ashby"],
      ["Stripe", "greenhouse"],
    ]);
    expect(companies.find((c) => c.name === "Capital One")?.atsConfig).toEqual({ tenant: "capitalone", wd: "wd12", site: "Capital_One" });
    expect(companies.find((c) => c.name === "Meta")?.atsConfig).toBeNull();

    const jobs = await db.job.findMany({ include: { company: true } });
    expect(jobs).toHaveLength(8);
    for (const job of jobs) {
      expect(job.description?.length).toBeGreaterThan(50);
      expect(["intern", "newgrad"]).toContain(job.type);
      if (job.company.ats) expect(job.id.startsWith(`${job.company.ats}:`)).toBe(true);
    }
    expect(jobs.find((j) => j.company.name === "Ramp")?.type).toBe("newgrad");

    const user = await db.user.findUniqueOrThrow({ where: { email: DEMO_USER.email }, include: { contacts: { include: { company: true } } } });
    expect(user.contacts.map((c) => `${c.name}@${c.company.name}`).sort()).toEqual([
      "Dana L.@Google",
      "Jordan K.@Datadog",
      "Marcus T.@Meta",
      "Priya N.@Stripe",
    ]);
    expect(await db.campaign.count()).toBe(0);
  });

  it("is idempotent", async () => {
    await seed(db);
    await seed(db);
    expect(await db.company.count()).toBe(8);
    expect(await db.job.count()).toBe(SEED_JOBS.length);
    expect(await db.contact.count()).toBe(4);
    expect(await db.user.count()).toBe(1);
  });
});
