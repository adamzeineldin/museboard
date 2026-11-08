import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/test/db";
import { createPrismaClient } from "./prisma-client";

// The web app and the worker are two processes writing one SQLite file. These tests hold the write lock from
// another thread (standing in for the other process) and check that this process waits for it instead of
// failing with SQLITE_BUSY.

const HOLD_MS = 300;
const require = createRequire(import.meta.url);
const betterSqlite3Path = require.resolve("better-sqlite3");

function dbFile(): string {
  const url = process.env.DATABASE_URL ?? "";
  return url.replace(/^file:/, "");
}

/** Take the write lock in another thread, insert a row, hold it for HOLD_MS, then commit. */
function holdWriteLock(): Promise<{ done: Promise<void> }> {
  const source = `
    const { parentPort, workerData } = require("node:worker_threads");
    const Database = require(workerData.driver);
    const conn = new Database(workerData.file, { timeout: 5000 });
    conn.exec("BEGIN IMMEDIATE");
    conn.prepare("INSERT INTO VerificationToken (identifier, token, expires) VALUES ('lock', 'holder', 0)").run();
    parentPort.postMessage("locked");
    const until = Date.now() + workerData.holdMs;
    while (Date.now() < until) {}
    conn.exec("COMMIT");
    conn.close();
  `;
  const worker = new Worker(source, { eval: true, workerData: { driver: betterSqlite3Path, file: dbFile(), holdMs: HOLD_MS } });
  const done = new Promise<void>((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`lock holder exited with ${code}`))));
  });
  return new Promise((resolve, reject) => {
    worker.once("message", () => resolve({ done }));
    worker.once("error", reject);
  });
}

describe("createPrismaClient on a SQLite file shared with another process", () => {
  const client = createPrismaClient(process.env.DATABASE_URL);

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await client.$disconnect();
    await resetDb();
  });

  it("uses WAL and a long busy timeout", async () => {
    const [mode] = await client.$queryRawUnsafe<Array<{ journal_mode: string }>>("PRAGMA journal_mode");
    const [timeout] = await client.$queryRawUnsafe<Array<{ timeout: bigint | number }>>("PRAGMA busy_timeout");
    expect(mode.journal_mode).toBe("wal");
    expect(Number(timeout.timeout)).toBeGreaterThanOrEqual(15_000);
  });

  it("waits for the other writer before a read-then-write transaction instead of failing with SQLITE_BUSY", async () => {
    const holder = await holdWriteLock();
    const created = await client.$transaction(async (tx) => {
      const before = await tx.company.count();
      const company = await tx.company.create({ data: { name: `Busy Co ${before}` } });
      return company.name;
    });
    await holder.done;
    expect(created).toBe("Busy Co 0");
    expect(await db.verificationToken.count({ where: { identifier: "lock" } })).toBe(1);
  });

  it("waits for the other writer before a plain write", async () => {
    const holder = await holdWriteLock();
    await client.company.create({ data: { name: "Plain Co" } });
    await holder.done;
    expect(await db.company.count({ where: { name: "Plain Co" } })).toBe(1);
  });
});
