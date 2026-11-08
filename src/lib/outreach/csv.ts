import Papa from "papaparse";
import { contactFieldsSchema, type ImportSource } from "./schemas";

// CSV import parsing (pure). Contacts come only from files the user exports themselves; nothing is scraped.
// Row numbers are spreadsheet rows: the header is row 1, so the first contact is row 2.

export const CSV_MAX_ROWS = 1000;
export const CSV_MAX_BYTES = 1024 * 1024;

type Field = "name" | "role" | "company" | "relationship" | "email" | "notes";

const HEADER_ALIASES: Record<string, Field> = {
  name: "name",
  fullname: "name",
  contactname: "name",
  role: "role",
  title: "role",
  jobtitle: "role",
  position: "role",
  company: "company",
  companyname: "company",
  employer: "company",
  organization: "company",
  organisation: "company",
  relationship: "relationship",
  howyouknowthem: "relationship",
  connection: "relationship",
  tie: "relationship",
  email: "email",
  emailaddress: "email",
  notes: "notes",
  note: "notes",
  comments: "notes",
};

export interface CsvRowError {
  row: number;
  message: string;
}

export interface CsvDuplicate {
  row: number;
  name: string;
  company: string;
}

export interface ParsedContactRow {
  row: number;
  name: string;
  role: string;
  company: string;
  relationship: string;
  email: string | null;
  notes: string | null;
}

export type CsvParseResult =
  | { ok: true; rows: ParsedContactRow[]; errors: CsvRowError[]; duplicates: CsvDuplicate[] }
  | { ok: false; error: string };

const normalizeHeader = (header: string): string => header.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Case-insensitive identity used for dedupe: (name, company). */
export function contactKey(name: string, company: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, " ")}\u0000${company.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function mapHeaders(headers: readonly string[]): Map<number, Field> {
  const mapping = new Map<number, Field>();
  const taken = new Set<Field>();
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field && !taken.has(field)) {
      mapping.set(index, field);
      taken.add(field);
    }
  });
  return mapping;
}

function rowToRecord(cells: readonly string[], mapping: Map<number, Field>): Partial<Record<Field, string>> {
  return Object.fromEntries(
    Array.from(mapping.entries()).map(([index, field]) => [field, (cells[index] ?? "").trim()]),
  );
}

const isBlank = (cells: readonly string[]): boolean => cells.every((cell) => cell.trim() === "");

/** Parse, validate and dedupe a contacts CSV. File-level problems return ok:false; row problems are reported per row. */
export function parseContactsCsv(text: string, source: ImportSource): CsvParseResult {
  if (byteLength(text) > CSV_MAX_BYTES) return { ok: false, error: "The file is larger than 1 MB. Split it and import the parts." };
  const body = text.replace(/^﻿/, "");
  if (body.trim() === "") return { ok: false, error: "The file is empty." };

  const parsed = Papa.parse<string[]>(body, { header: false, skipEmptyLines: false });
  const [headers = [], ...records] = parsed.data;
  const mapping = mapHeaders(headers);
  const fields = new Set(mapping.values());
  if (!fields.has("name") || !fields.has("company")) {
    const found = headers.map((h) => h.trim()).filter(Boolean).join(", ") || "none";
    return { ok: false, error: `The CSV needs a name column and a company column (found: ${found}).` };
  }

  const numbered = records.map((cells, index) => ({ row: index + 2, cells })).filter(({ cells }) => !isBlank(cells));
  if (numbered.length === 0) return { ok: false, error: "The CSV has a header row but no contacts." };
  if (numbered.length > CSV_MAX_ROWS) {
    return { ok: false, error: `The CSV has ${numbered.length} rows. Import at most ${CSV_MAX_ROWS} at a time.` };
  }

  const rows: ParsedContactRow[] = [];
  const errors: CsvRowError[] = [];
  const duplicates: CsvDuplicate[] = [];
  const seen = new Set<string>();

  for (const { row, cells } of numbered) {
    const result = contactFieldsSchema.safeParse(rowToRecord(cells, mapping));
    if (!result.success) {
      errors.push({ row, message: result.error.issues[0]?.message ?? "This row couldn't be read" });
      continue;
    }
    const key = contactKey(result.data.name, result.data.company);
    if (seen.has(key)) {
      duplicates.push({ row, name: result.data.name, company: result.data.company });
      continue;
    }
    seen.add(key);
    const relationship = result.data.relationship || (source === "alumni-list" ? "Alum" : "");
    rows.push({ row, ...result.data, relationship });
  }

  return { ok: true, rows, errors, duplicates };
}
