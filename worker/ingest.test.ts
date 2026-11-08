import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/test/db";
import { failedCompany, okCompany, rawJob, rawRun } from "./fixtures";
import { ingestRun, InvalidRunError } from "./ingest";

const T1 = new Date("2026-11-07T12:00:00Z");
const T2 = new Date("2026-11-07T18:00:00Z");
const T3 = new Date("2026-11-08T00:00:00Z");

async function seedCompany(name: string, ats: string | null, atsConfig: Record<string, string> | null): Promise<string> {
  const row = await db.company.create({ data: { name, ats, ...(atsConfig ? { atsConfig } : {}) } });
  return row.id;
}

describe("ingestRun", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates the company and its jobs on first sight", async () => {
    const result = await ingestRun(db, rawRun([okCompany([rawJob("1"), rawJob("2", { location: null, posted_at: null })])]), T1);

    expect(result).toMatchObject({ created: 2, updated: 0, reopened: 0, closed: 0, skippedCompanies: 0, droppedPostings: 0 });
    const company = await db.company.findUniqueOrThrow({ where: { name: "Stripe" } });
    expect(company.ats).toBe("greenhouse");
    const job = await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:1" } });
    expect(job).toMatchObject({
      companyId: company.id,
      title: "Software Engineer Intern 1",
      location: "New York",
      type: "intern",
      url: "https://boards.greenhouse.io/stripe/jobs/1",
      source: "Greenhouse feed",
      description: "Build payments APIs.",
      compensation: "$55/hr",
      department: "Engineering",
      closedAt: null,
    });
    expect(job.postedAt?.toISOString()).toBe("2026-11-01T09:30:00.000Z");
    expect(job.firstSeenAt.toISOString()).toBe(T1.toISOString());
    const noLocation = await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:2" } });
    expect(noLocation.location).toBe("");
    expect(noLocation.postedAt).toBeNull();
  });

  it("keeps an existing company's ats and atsConfig", async () => {
    await seedCompany("Stripe", "greenhouse", { board: "stripe" });
    await ingestRun(db, rawRun([okCompany([rawJob("1")])]), T1);

    const companies = await db.company.findMany();
    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ ats: "greenhouse", atsConfig: { board: "stripe" } });
  });

  it("reuses a company a user created with different casing instead of duplicating it", async () => {
    const id = await seedCompany(" stripe ", null, null);
    await ingestRun(db, rawRun([okCompany([rawJob("1")])]), T1);

    const companies = await db.company.findMany();
    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ id, name: " stripe ", ats: null });
    expect((await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:1" } })).companyId).toBe(id);
  });

  it("updates fields of an existing job but keeps firstSeenAt", async () => {
    await ingestRun(db, rawRun([okCompany([rawJob("1")])]), T1);
    const changed = rawJob("1", {
      title: "Software Engineer Intern, Summer 2027",
      location: "Remote",
      description_text: "New description",
      compensation: null,
      url: "https://boards.greenhouse.io/stripe/jobs/1?v=2",
      posted_at: "2026-11-05T00:00:00Z",
    });

    const result = await ingestRun(db, rawRun([okCompany([changed])]), T2);

    expect(result).toMatchObject({ created: 0, updated: 1, closed: 0 });
    const job = await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:1" } });
    expect(job).toMatchObject({
      title: "Software Engineer Intern, Summer 2027",
      location: "Remote",
      description: "New description",
      compensation: null,
      url: "https://boards.greenhouse.io/stripe/jobs/1?v=2",
    });
    expect(job.postedAt?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(job.firstSeenAt.toISOString()).toBe(T1.toISOString());
  });

  it("closes open jobs of an ok company that are missing from the run, then reopens them", async () => {
    await ingestRun(db, rawRun([okCompany([rawJob("1"), rawJob("2")])]), T1);

    const second = await ingestRun(db, rawRun([okCompany([rawJob("1")])]), T2);
    expect(second).toMatchObject({ created: 0, updated: 1, closed: 1 });
    const closed = await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:2" } });
    expect(closed.closedAt?.toISOString()).toBe(T2.toISOString());

    // Already-closed jobs are not closed again (closedAt keeps its first value).
    const third = await ingestRun(db, rawRun([okCompany([rawJob("1")])]), T3);
    expect(third.closed).toBe(0);
    expect((await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:2" } })).closedAt?.toISOString()).toBe(
      T2.toISOString(),
    );

    const fourth = await ingestRun(db, rawRun([okCompany([rawJob("1"), rawJob("2")])]), T3);
    expect(fourth).toMatchObject({ created: 0, updated: 2, reopened: 1, closed: 0 });
    const reopened = await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:2" } });
    expect(reopened.closedAt).toBeNull();
    expect(reopened.firstSeenAt.toISOString()).toBe(T1.toISOString());
  });

  it("closes every open job of an ok company that now has no postings", async () => {
    await ingestRun(db, rawRun([okCompany([rawJob("1"), rawJob("2")])]), T1);
    const result = await ingestRun(db, rawRun([okCompany([])]), T2);
    expect(result.closed).toBe(2);
  });

  it("leaves a failed company and its jobs untouched", async () => {
    await ingestRun(db, rawRun([okCompany([rawJob("1")])]), T1);
    const before = await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:1" } });

    const result = await ingestRun(db, rawRun([failedCompany("Stripe", "greenhouse")]), T2);

    expect(result).toMatchObject({ created: 0, updated: 0, closed: 0, skippedCompanies: 1 });
    expect(result.failures).toEqual([{ company: "Stripe", error: "HTTP 503 from board" }]);
    const after = await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:1" } });
    expect(after).toEqual(before);
  });

  it("does not create a company row for a failed company", async () => {
    await ingestRun(db, rawRun([failedCompany("Capital One", "workday")]), T1);
    expect(await db.company.count()).toBe(0);
  });

  it("never touches companies missing from the run or jobs of other companies", async () => {
    const metaId = await seedCompany("Meta", null, null);
    await db.job.create({
      data: { id: "sample:meta:1", companyId: metaId, title: "SWE Intern", location: "Menlo Park", type: "intern", url: "https://www.metacareers.com/", source: "Sample" },
    });
    const ramp = okCompany([rawJob("r1", { id: "ashby:ramp:r1", company: "Ramp", ats: "ashby", source: "Ashby feed" })], {
      company: "Ramp",
      ats: "ashby",
    });
    await ingestRun(db, rawRun([okCompany([rawJob("1")]), ramp]), T1);

    // Stripe only this time: Ramp is absent (e.g. a --company filter), Meta was never scraped.
    const result = await ingestRun(db, rawRun([okCompany([])]), T2);

    expect(result.closed).toBe(1);
    expect((await db.job.findUniqueOrThrow({ where: { id: "ashby:ramp:r1" } })).closedAt).toBeNull();
    expect((await db.job.findUniqueOrThrow({ where: { id: "sample:meta:1" } })).closedAt).toBeNull();
  });

  it("drops postings whose type is null and closes a job that turned into one", async () => {
    await ingestRun(db, rawRun([okCompany([rawJob("1"), rawJob("2")])]), T1);

    const result = await ingestRun(db, rawRun([okCompany([rawJob("1"), rawJob("2", { type: null }), rawJob("3", { type: null })])]), T2);

    expect(result).toMatchObject({ created: 0, updated: 1, closed: 1, droppedPostings: 2 });
    expect(await db.job.findUnique({ where: { id: "greenhouse:stripe:3" } })).toBeNull();
    expect((await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:2" } })).closedAt?.toISOString()).toBe(
      T2.toISOString(),
    );
  });

  it("ingests a posting id that appears twice in one run only once", async () => {
    const result = await ingestRun(db, rawRun([okCompany([rawJob("1"), rawJob("1", { title: "Duplicate" })])]), T1);
    expect(result.created).toBe(1);
    expect((await db.job.findUniqueOrThrow({ where: { id: "greenhouse:stripe:1" } })).title).toBe("Software Engineer Intern 1");
  });

  describe("invalid run JSON", () => {
    const cases: Array<[string, unknown]> = [
      ["not an object", "nope"],
      ["missing companies", { run_at: "2026-11-07T12:00:00Z" }],
      ["unknown top-level key", { ...rawRun([]), extra: 1 }],
      ["bad run_at", rawRun([], "yesterday")],
      ["unknown ats", rawRun([okCompany([], { ats: "workable" })])],
      ["bad job type", rawRun([okCompany([rawJob("1", { type: "senior" })])])],
      ["non-http url", rawRun([okCompany([rawJob("1", { url: "javascript:alert(1)" })])])],
      ["unknown job key", rawRun([okCompany([{ ...rawJob("1"), salary: "1" } as never])])],
      ["failed company with jobs", rawRun([{ ...failedCompany("Stripe", "greenhouse"), jobs: [rawJob("1")] }])],
      ["failed company without error", rawRun([{ ...failedCompany("Stripe", "greenhouse"), error: null }])],
      ["job of another company", rawRun([okCompany([rawJob("1", { company: "Ramp" })])])],
      ["job id with another ats prefix", rawRun([okCompany([rawJob("1", { id: "lever:stripe:1" })])])],
      ["duplicate company", rawRun([okCompany([]), okCompany([])])],
      ["bad posted_at", rawRun([okCompany([rawJob("1", { posted_at: "2026-13-40T00:00:00Z" })])])],
      ["description over 8000 chars", rawRun([okCompany([rawJob("1", { description_text: "x".repeat(8001) })])])],
    ];

    it.each(cases)("rejects %s without writing anything", async (_label, input) => {
      await expect(ingestRun(db, input, T1)).rejects.toBeInstanceOf(InvalidRunError);
      expect(await db.company.count()).toBe(0);
      expect(await db.job.count()).toBe(0);
    });

    it("explains what is wrong", async () => {
      await expect(ingestRun(db, rawRun([], "yesterday"), T1)).rejects.toThrow(/run_at/);
    });
  });
});
