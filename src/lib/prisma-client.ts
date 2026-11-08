import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { serializedAdapterFactory } from "./serialized-adapter";

export const DEFAULT_DATABASE_URL = "file:./dev.db";

// The web app and the worker are separate processes on one SQLite file. WAL lets readers run while the other
// process writes, and a write waits up to BUSY_TIMEOUT_MS for the other process's write lock instead of failing.
const BUSY_TIMEOUT_MS = 15_000;
const CONNECT_SCRIPT = "PRAGMA journal_mode = WAL;";

/**
 * Build a Prisma client for the given SQLite URL (Prisma 7 requires a driver adapter).
 * Not marked server-only so scripts (seed, worker) can use it; app code should import `db` from "@/lib/db".
 * TODO(postgres): swap PrismaBetterSqlite3 for @prisma/adapter-pg and change the schema provider. That also ends
 * the synchronous busy-timeout stall described in ./serialized-adapter.ts.
 */
export function createPrismaClient(url: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): PrismaClient {
  if (!url.startsWith("file:")) {
    throw new Error(`DATABASE_URL must be a SQLite "file:" URL for the local adapter, got "${url.split(":")[0]}:..."`);
  }
  // Serialized: one connection is shared by every request, and transactions start with BEGIN IMMEDIATE so they
  // wait for the other process's write lock; see ./serialized-adapter.ts.
  const sqlite = new PrismaBetterSqlite3({ url, timeout: BUSY_TIMEOUT_MS });
  return new PrismaClient({
    adapter: serializedAdapterFactory(sqlite, { connectScript: CONNECT_SCRIPT, immediate: true }),
  });
}
