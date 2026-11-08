import "server-only";
import { db } from "@/lib/db";

// Resolve company names typed by the user (manual entry or CSV) to Company ids.
// Matching is case-insensitive. Unknown companies are created with ats = null, which means
// "no public job feed": the worker never scrapes them. Existing companies are never modified.

const normalize = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Map of normalized name -> company id for every name given, creating missing companies. */
export async function resolveCompanyIds(names: readonly string[]): Promise<Map<string, string>> {
  const wanted = new Map<string, string>();
  for (const name of names) {
    const key = normalize(name);
    if (key && !wanted.has(key)) wanted.set(key, name.trim().replace(/\s+/g, " "));
  }
  if (wanted.size === 0) return new Map();

  // SQLite has no case-insensitive `mode`, so compare in memory. The Company table is small (one row per employer).
  const existing = await db.company.findMany({ select: { id: true, name: true } });
  const ids = new Map<string, string>();
  for (const company of existing) {
    const key = normalize(company.name);
    if (wanted.has(key) && !ids.has(key)) ids.set(key, company.id);
  }

  for (const [key, displayName] of wanted) {
    if (ids.has(key)) continue;
    const created = await db.company.upsert({
      where: { name: displayName },
      create: { name: displayName, ats: null },
      update: {},
      select: { id: true },
    });
    ids.set(key, created.id);
  }
  return ids;
}

export async function resolveCompanyId(name: string): Promise<string> {
  const ids = await resolveCompanyIds([name]);
  const id = ids.get(normalize(name));
  if (!id) throw new Error(`Could not resolve company "${name}"`);
  return id;
}

export { normalize as normalizeCompanyName };
