import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import { createContact } from "./contacts";
import { importContactsCsv } from "./import";

describe("importContactsCsv", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("imports valid rows, reports bad rows by row number, and audits the import", async () => {
    const user = await createTestUser();
    await db.company.create({ data: { name: "Stripe", ats: "greenhouse" } });
    const csv = ["Name,Role,Company,Relationship", "Priya N.,SWE II,stripe,Alum", ",SWE,Stripe,Alum", "Jordan K.,SWE,Datadog,Alum"].join("\n");

    const result = await importContactsCsv(user.id, csv, "alumni-list", "alumni.csv");
    expect(result).toEqual({
      ok: true,
      created: 2,
      errors: [{ row: 3, message: "Name is required" }],
      duplicates: [],
    });
    const contacts = await db.contact.findMany({ where: { userId: user.id }, include: { company: true }, orderBy: { name: "asc" } });
    expect(contacts.map((c) => [c.name, c.company.name, c.source])).toEqual([
      ["Jordan K.", "Datadog", "alumni-list"],
      ["Priya N.", "Stripe", "alumni-list"],
    ]);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { userId: user.id, action: "contacts.imported" } });
    expect(audit).toMatchObject({ actor: "user", payload: { source: "alumni-list", filename: "alumni.csv", created: 2, errors: 1, duplicates: 0 } });
  });

  it("creates unknown companies with ats null and reuses one company for repeated names", async () => {
    const user = await createTestUser();
    const csv = "name,company\nA,Acme Robotics\nB,acme robotics\n";
    const result = await importContactsCsv(user.id, csv, "csv");
    expect(result).toMatchObject({ ok: true, created: 2 });
    const companies = await db.company.findMany();
    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({ name: "Acme Robotics", ats: null });
  });

  it("never changes an existing company's ATS config", async () => {
    const user = await createTestUser();
    await db.company.create({ data: { name: "Stripe", ats: "greenhouse", atsConfig: { board: "stripe" } } });
    await importContactsCsv(user.id, "name,company\nA,STRIPE\n", "csv");
    expect(await db.company.findUniqueOrThrow({ where: { name: "Stripe" } })).toMatchObject({ ats: "greenhouse", atsConfig: { board: "stripe" } });
    expect(await db.company.count()).toBe(1);
  });

  it("skips contacts already saved and duplicates inside the file", async () => {
    const user = await createTestUser();
    await createContact(user.id, { name: "Priya N.", company: "Stripe" });
    const csv = "name,company\nPRIYA N.,stripe\nNew Person,Stripe\nnew person,STRIPE\n";
    const result = await importContactsCsv(user.id, csv, "csv");
    expect(result).toEqual({
      ok: true,
      created: 1,
      errors: [],
      duplicates: [
        { row: 2, name: "PRIYA N.", company: "stripe" },
        { row: 4, name: "new person", company: "STRIPE" },
      ],
    });
    expect(await db.contact.count({ where: { userId: user.id } })).toBe(2);
  });

  it("only dedupes against the importing user's own contacts", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    await createContact(other.id, { name: "Priya N.", company: "Stripe" });
    expect(await importContactsCsv(owner.id, "name,company\nPriya N.,Stripe\n", "csv")).toMatchObject({ created: 1 });
  });

  it("returns a file-level error without writing anything", async () => {
    const user = await createTestUser();
    const result = await importContactsCsv(user.id, "first,last\nA,B\n", "csv");
    expect(result).toEqual({ ok: false, error: "The CSV needs a name column and a company column (found: first, last)." });
    expect(await db.contact.count()).toBe(0);
    expect(await db.auditEvent.count()).toBe(0);
  });

  it("rejects an invalid source", async () => {
    const user = await createTestUser();
    // @ts-expect-error source is validated at runtime too
    const result = await importContactsCsv(user.id, "name,company\nA,B\n", "linkedin");
    expect(result).toEqual({ ok: false, error: "Pick where this list came from" });
  });

  it("audits an import where every row fails, without creating contacts", async () => {
    const user = await createTestUser();
    const result = await importContactsCsv(user.id, "name,company\n,Stripe\n", "csv");
    expect(result).toEqual({ ok: true, created: 0, errors: [{ row: 2, message: "Name is required" }], duplicates: [] });
    expect(await db.auditEvent.count({ where: { action: "contacts.imported" } })).toBe(1);
  });
});
