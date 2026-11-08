import "server-only";
import { db } from "@/lib/db";

// Resolve a company name typed by Muse to Company ids. Case-insensitive: an exact name wins, otherwise
// every company whose name contains the text. Read-only (never creates a company).

export interface CompanyRef {
  id: string;
  name: string;
}

const normalize = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

export async function findCompanies(name: string): Promise<CompanyRef[]> {
  const wanted = normalize(name);
  if (!wanted) return [];
  const companies = await db.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const exact = companies.filter((company) => normalize(company.name) === wanted);
  return exact.length > 0 ? exact : companies.filter((company) => normalize(company.name).includes(wanted));
}
