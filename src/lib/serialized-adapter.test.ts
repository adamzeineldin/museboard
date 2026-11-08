import { describe, expect, it } from "vitest";
import { createLock, serializeAdapter, serializedAdapterFactory } from "./serialized-adapter";

type Adapter = Parameters<typeof serializeAdapter>[0];

/** A fake adapter that records the order statements reach the "connection". */
function fakeAdapter(log: string[], options: { failBegin?: boolean; failTxSql?: string } = {}): Adapter {
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
    executeScript: async (script: string) => void log.push(`script:${script}`),
    async startTransaction() {
      if (options.failBegin) throw new Error("begin failed");
      log.push("BEGIN");
      return {
        provider: "sqlite",
        adapterName: "fake",
        options: { usePhantomQuery: false },
        queryRaw: query("tx"),
        executeRaw: async (q) => {
          if (q.sql === options.failTxSql) throw new Error(`${q.sql} failed`);
          log.push(`tx:${q.sql}`);
          return 1;
        },
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

describe("serializeAdapter with immediate transactions", () => {
  it("re-opens each transaction as BEGIN IMMEDIATE so it takes the write lock up front", async () => {
    const log: string[] = [];
    const adapter = serializeAdapter(fakeAdapter(log), { immediate: true });
    const tx = await adapter.startTransaction();
    await tx.executeRaw(sql("INSERT INTO Company"));
    await tx.commit();
    expect(log).toEqual(["BEGIN", "tx:COMMIT", "tx:BEGIN IMMEDIATE", "tx:INSERT INTO Company", "COMMIT"]);
  });

  it("releases both locks and rethrows when BEGIN IMMEDIATE fails", async () => {
    const log: string[] = [];
    const adapter = serializeAdapter(fakeAdapter(log, { failTxSql: "BEGIN IMMEDIATE" }), { immediate: true });
    await expect(adapter.startTransaction()).rejects.toThrow("BEGIN IMMEDIATE failed");
    await adapter.queryRaw(sql("SELECT 3"));
    expect(log).toEqual(["BEGIN", "tx:COMMIT", "ROLLBACK", "top:SELECT 3"]);
  });
});

describe("serializedAdapterFactory", () => {
  function fakeFactory(log: string[]) {
    return {
      provider: "sqlite" as const,
      adapterName: "fake",
      connect: async () => fakeAdapter(log),
      connectToShadowDb: async () => fakeAdapter(log),
    };
  }

  it("runs the connect script on each new connection, but not on the shadow database", async () => {
    const log: string[] = [];
    const factory = serializedAdapterFactory(fakeFactory(log), { connectScript: "PRAGMA journal_mode = WAL;" });
    await factory.connect();
    await factory.connectToShadowDb();
    expect(log).toEqual(["script:PRAGMA journal_mode = WAL;"]);
  });

  it("passes the immediate option to the connections it opens", async () => {
    const log: string[] = [];
    const adapter = await serializedAdapterFactory(fakeFactory(log), { immediate: true }).connect();
    await (await adapter.startTransaction()).rollback();
    expect(log).toEqual(["BEGIN", "tx:COMMIT", "tx:BEGIN IMMEDIATE", "ROLLBACK"]);
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
