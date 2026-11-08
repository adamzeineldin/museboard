import { describe, expect, it } from "vitest";
import { createLock, serializeAdapter } from "./serialized-adapter";

type Adapter = Parameters<typeof serializeAdapter>[0];

/** A fake adapter that records the order statements reach the "connection". */
function fakeAdapter(log: string[], options: { failBegin?: boolean } = {}): Adapter {
  const result = { columnNames: [], columnTypes: [], rows: [] };
  const query = (label: string) => async (q: { sql: string }) => {
    log.push(`${label}:${q.sql}`);
    return result;
  };
  return {
    provider: "sqlite",
    adapterName: "fake",
    queryRaw: query("top"),
    executeRaw: async (q) => (log.push(`top:${q.sql}`), 1),
    executeScript: async () => undefined,
    async startTransaction() {
      if (options.failBegin) throw new Error("begin failed");
      log.push("BEGIN");
      return {
        provider: "sqlite",
        adapterName: "fake",
        options: { usePhantomQuery: false },
        queryRaw: query("tx"),
        executeRaw: async (q) => (log.push(`tx:${q.sql}`), 1),
        commit: async () => void log.push("COMMIT"),
        rollback: async () => void log.push("ROLLBACK"),
      };
    },
    dispose: async () => undefined,
  } as Adapter;
}

const sql = (text: string) => ({ sql: text, args: [], argTypes: [] });

describe("serializeAdapter", () => {
  it("holds a top-level write until the open transaction rolls back, so the rollback cannot discard it", async () => {
    const log: string[] = [];
    const adapter = serializeAdapter(fakeAdapter(log));
    const tx = await adapter.startTransaction();
    const audit = adapter.executeRaw(sql("INSERT INTO AuditEvent"));
    await tx.executeRaw(sql("INSERT INTO Application"));
    await tx.rollback();
    await audit;
    expect(log).toEqual(["BEGIN", "tx:INSERT INTO Application", "ROLLBACK", "top:INSERT INTO AuditEvent"]);
  });

  it("starts a transaction only after in-flight queries and earlier transactions finish", async () => {
    const log: string[] = [];
    const adapter = serializeAdapter(fakeAdapter(log));
    const first = await adapter.startTransaction();
    const second = adapter.startTransaction();
    await first.queryRaw(sql("SELECT 1"));
    await first.commit();
    const tx = await second;
    await tx.commit();
    expect(log).toEqual(["BEGIN", "tx:SELECT 1", "COMMIT", "BEGIN", "COMMIT"]);
  });

  it("releases the lock when BEGIN fails", async () => {
    const log: string[] = [];
    const adapter = serializeAdapter(fakeAdapter(log, { failBegin: true }));
    await expect(adapter.startTransaction()).rejects.toThrow("begin failed");
    await adapter.queryRaw(sql("SELECT 2"));
    expect(log).toEqual(["top:SELECT 2"]);
  });
});

describe("createLock", () => {
  it("grants the lock in request order and ignores a double release", async () => {
    const lock = createLock();
    const order: number[] = [];
    const release1 = await lock.acquire();
    const second = lock.acquire().then((release) => {
      order.push(2);
      release();
    });
    const third = lock.acquire().then((release) => {
      order.push(3);
      release();
    });
    order.push(1);
    release1();
    release1();
    await Promise.all([second, third]);
    expect(order).toEqual([1, 2, 3]);
  });
});
