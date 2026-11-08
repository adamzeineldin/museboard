import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { normalizeCompanyName, resolveCompanyIds } from "./companies";
import { contactKey, parseContactsCsv, type CsvDuplicate, type CsvRowError } from "./csv";
import { importSourceSchema, type ImportSource } from "./schemas";

// CSV import of contacts the user exported themselves (e.g. an alumni list). Nothing is scraped.
// Valid rows are imported even when other rows fail; failures come back with their row number.

export type ImportResult =
  | { ok: true; created: number; errors: CsvRowError[]; duplicates: CsvDuplicate[] }
  | { ok: false; error: string };

function companyIdFor(ids: Map<string, string>, name: string): string {
  const id = ids.get(normalizeCompanyName(name));
  if (!id) throw new Error(`Company "${name}" was not resolved`);
  return id;
}

export async function importContactsCsv(userId: string, text: string, source: ImportSource, filename?: string): Promise<ImportResult> {
  const sourceResult = importSourceSchema.safeParse(source);
  if (!sourceResult.success) return { ok: false, error: sourceResult.error.issues[0]?.message ?? "Pick a source" };

  const parsed = parseContactsCsv(text, sourceResult.data);
  if (!parsed.ok) return parsed;

  const companyIds = await resolveCompanyIds(parsed.rows.map((row) => row.company));
  const existing = await db.contact.findMany({ where: { userId }, select: { name: true, company: { select: { name: true } } } });
  const existingKeys = new Set(existing.map((c) => contactKey(c.name, c.company.name)));

  const fresh = parsed.rows.filter((row) => !existingKeys.has(contactKey(row.name, row.company)));
  const alreadySaved = parsed.rows
    .filter((row) => existingKeys.has(contactKey(row.name, row.company)))
    .map(({ row, name, company }) => ({ row, name, company }));

  if (fresh.length > 0) {
    await db.contact.createMany({
      data: fresh.map((row) => ({
        userId,
        companyId: companyIdFor(companyIds, row.company),
        name: row.name,
        role: row.role,
        relationship: row.relationship,
        email: row.email,
        notes: row.notes,
        source: sourceResult.data,
      })),
    });
  }

  const duplicates = [...alreadySaved, ...parsed.duplicates].sort((a, b) => a.row - b.row);
  await writeAudit(userId, "user", "contacts.imported", {
    source: sourceResult.data,
    filename: filename ?? null,
    created: fresh.length,
    errors: parsed.errors.length,
    duplicates: duplicates.length,
  });
  return { ok: true, created: fresh.length, errors: parsed.errors, duplicates };
}
