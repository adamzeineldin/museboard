import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { serializedAdapterFactory } from "./serialized-adapter";

export const DEFAULT_DATABASE_URL = "file:./dev.db";

/**
 * Build a Prisma client for the given SQLite URL (Prisma 7 requires a driver adapter).
 * Not marked server-only so scripts (seed, worker) can use it; app code should import `db` from "@/lib/db".
 * TODO(postgres): swap PrismaBetterSqlite3 for @prisma/adapter-pg and change the schema provider.
 */
export function createPrismaClient(url: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): PrismaClient {
  if (!url.startsWith("file:")) {
    throw new Error(`DATABASE_URL must be a SQLite "file:" URL for the local adapter, got "${url.split(":")[0]}:..."`);
  }
  // Serialized: one connection is shared by every request, see ./serialized-adapter.ts.
  return new PrismaClient({ adapter: serializedAdapterFactory(new PrismaBetterSqlite3({ url })) });
}
