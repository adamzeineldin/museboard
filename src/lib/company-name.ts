// Pure: how company names are compared everywhere (user input, CSV imports, scraper runs).
// Company.name is unique but case-sensitive in SQLite and Postgres, so callers match on this key first.

/** "  Capital  One " -> "capital one". */
export const normalizeCompanyName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();
