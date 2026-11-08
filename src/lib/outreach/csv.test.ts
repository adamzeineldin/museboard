import { describe, expect, it } from "vitest";
import { CSV_MAX_BYTES, CSV_MAX_ROWS, parseContactsCsv } from "./csv";

function expectOk(result: ReturnType<typeof parseContactsCsv>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

describe("parseContactsCsv", () => {
  it("parses good rows with all columns", () => {
    const csv = [
      "name,role,company,relationship,email,notes",
      "Priya N.,Software Engineer II,Stripe,\"Alum, class of 2023\",priya@example.com,Coffee chat Oct 14",
      "Jordan K.,Software Engineer,Datadog,Alum,,",
    ].join("\n");
    const result = expectOk(parseContactsCsv(csv, "csv"));
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        row: 2,
        name: "Priya N.",
        role: "Software Engineer II",
        company: "Stripe",
        relationship: "Alum, class of 2023",
        email: "priya@example.com",
        notes: "Coffee chat Oct 14",
      },
      { row: 3, name: "Jordan K.", role: "Software Engineer", company: "Datadog", relationship: "Alum", email: null, notes: null },
    ]);
  });

  it("reports bad rows with their spreadsheet row number and keeps the valid ones", () => {
    const csv = [
      "name,company,email",
      "Good One,Stripe,",
      ",Stripe,",
      "No Company,,",
      "Bad Email,Ramp,not-an-email",
      "Good Two,Ramp,two@example.com",
    ].join("\n");
    const result = expectOk(parseContactsCsv(csv, "csv"));
    expect(result.rows.map((r) => [r.row, r.name])).toEqual([
      [2, "Good One"],
      [6, "Good Two"],
    ]);
    expect(result.errors).toEqual([
      { row: 3, message: "Name is required" },
      { row: 4, message: "Company is required" },
      { row: 5, message: "Email doesn't look right" },
    ]);
  });

  it("matches headers case- and spacing-insensitively and accepts common variants", () => {
    const csv = [" Full Name ,JOB TITLE,Company Name,How You Know Them,E-mail,Comments", "Dana L.,SWE,Google,Mentor,d@example.com,Met once"].join(
      "\r\n",
    );
    const result = expectOk(parseContactsCsv(csv, "csv"));
    expect(result.rows[0]).toMatchObject({ name: "Dana L.", role: "SWE", company: "Google", relationship: "Mentor", email: "d@example.com", notes: "Met once" });
  });

  it("strips a UTF-8 byte order mark", () => {
    const csv = "﻿Name,Company\nPriya N.,Stripe\n";
    const result = expectOk(parseContactsCsv(csv, "csv"));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Priya N.");
  });

  it("skips blank lines without shifting row numbers", () => {
    const csv = "name,company\nA,Stripe\n\n,\nB,Ramp\n";
    const result = expectOk(parseContactsCsv(csv, "csv"));
    expect(result.rows.map((r) => [r.row, r.name])).toEqual([
      [2, "A"],
      [5, "B"],
    ]);
    expect(result.errors).toEqual([]);
  });

  it("dedupes repeated (name, company) pairs inside the file, case-insensitively", () => {
    const csv = "name,company\nPriya N.,Stripe\npriya n. , STRIPE\nPriya N.,Ramp\n";
    const result = expectOk(parseContactsCsv(csv, "csv"));
    expect(result.rows.map((r) => [r.row, r.company])).toEqual([
      [2, "Stripe"],
      [4, "Ramp"],
    ]);
    expect(result.duplicates).toEqual([{ row: 3, name: "priya n.", company: "STRIPE" }]);
  });

  it("defaults the relationship to 'Alum' for an alumni list and leaves it empty for a plain CSV", () => {
    const csv = "name,company\nPriya N.,Stripe\n";
    expect(expectOk(parseContactsCsv(csv, "alumni-list")).rows[0].relationship).toBe("Alum");
    expect(expectOk(parseContactsCsv(csv, "csv")).rows[0].relationship).toBe("");
  });

  it("rejects a file without name and company columns", () => {
    const result = parseContactsCsv("first,last\nA,B\n", "csv");
    expect(result).toEqual({ ok: false, error: "The CSV needs a name column and a company column (found: first, last)." });
  });

  it("rejects an empty file", () => {
    expect(parseContactsCsv("", "csv")).toEqual({ ok: false, error: "The file is empty." });
    expect(parseContactsCsv("﻿  \n", "csv")).toEqual({ ok: false, error: "The file is empty." });
  });

  it("rejects a file with only a header row", () => {
    expect(parseContactsCsv("name,company\n", "csv")).toEqual({ ok: false, error: "The CSV has a header row but no contacts." });
  });

  it("rejects more than the row limit", () => {
    const lines = ["name,company", ...Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `Person ${i},Stripe`)];
    const result = parseContactsCsv(lines.join("\n"), "csv");
    expect(result).toEqual({ ok: false, error: `The CSV has ${CSV_MAX_ROWS + 1} rows. Import at most ${CSV_MAX_ROWS} at a time.` });
  });

  it("accepts exactly the row limit", () => {
    const lines = ["name,company", ...Array.from({ length: CSV_MAX_ROWS }, (_, i) => `Person ${i},Stripe`)];
    expect(expectOk(parseContactsCsv(lines.join("\n"), "csv")).rows).toHaveLength(CSV_MAX_ROWS);
  });

  it("rejects files over the size limit", () => {
    const big = `name,company\n${"x".repeat(CSV_MAX_BYTES)},Stripe\n`;
    expect(parseContactsCsv(big, "csv")).toEqual({ ok: false, error: "The file is larger than 1 MB. Split it and import the parts." });
  });

  it("reports over-long fields per row", () => {
    const csv = `name,company\n${"n".repeat(200)},Stripe\n`;
    const result = expectOk(parseContactsCsv(csv, "csv"));
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ row: 2, message: "Name must be 120 characters or fewer" }]);
  });

  it("ignores unknown extra columns", () => {
    const csv = "name,company,linkedin\nPriya,Stripe,whatever\n";
    expect(expectOk(parseContactsCsv(csv, "csv")).rows[0]).not.toHaveProperty("linkedin");
  });
});
