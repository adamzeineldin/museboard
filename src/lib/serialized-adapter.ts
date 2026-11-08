import type { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// The better-sqlite3 adapter runs every request in the process on ONE connection. Its own mutex only
// serializes interactive transactions, so a plain (autocommit) query from another request runs inside
// whatever BEGIN is open on that connection: it sees uncommitted rows, and if that transaction rolls back
// the other request's write (an audit row, a draft, ...) is silently discarded with it.
//
// This wrapper puts every top-level query behind the same lock as transactions: a query waits until any open
// transaction commits or rolls back, and a transaction waits for in-flight queries. Code inside a
// $transaction callback must therefore use its `tx` client, never `db` (that would wait on itself until the
// transaction times out).

type AdapterFactory = Pick<PrismaBetterSqlite3, "provider" | "adapterName" | "connect" | "connectToShadowDb">;
type SqlAdapter = Awaited<ReturnType<PrismaBetterSqlite3["connect"]>>;
type SqlTransaction = Awaited<ReturnType<SqlAdapter["startTransaction"]>>;
type Release = () => void;

/** A FIFO lock: acquire() resolves with a release function once every earlier holder has released. */
export function createLock(): { acquire: () => Promise<Release> } {
  let tail: Promise<void> = Promise.resolve();
  return {
    acquire() {
      let unlock: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const ready = tail.then(() => {
        let released = false;
        return () => {
          if (released) return;
          released = true;
          unlock();
        };
      });
      tail = tail.then(() => held);
      return ready;
    },
  };
}

function wrapTransaction(inner: SqlTransaction, release: Release): SqlTransaction {
  const finish = async (end: () => Promise<void>): Promise<void> => {
    try {
      await end();
    } finally {
      release();
    }
  };
  return {
    provider: inner.provider,
    adapterName: inner.adapterName,
    options: inner.options,
    queryRaw: (query) => inner.queryRaw(query),
    executeRaw: (query) => inner.executeRaw(query),
    commit: () => finish(() => inner.commit()),
    rollback: () => finish(() => inner.rollback()),
    ...(inner.createSavepoint ? { createSavepoint: (name: string) => inner.createSavepoint!(name) } : {}),
    ...(inner.rollbackToSavepoint ? { rollbackToSavepoint: (name: string) => inner.rollbackToSavepoint!(name) } : {}),
    ...(inner.releaseSavepoint ? { releaseSavepoint: (name: string) => inner.releaseSavepoint!(name) } : {}),
  };
}

/** Wrap one connected adapter so top-level queries and transactions never interleave. */
export function serializeAdapter(inner: SqlAdapter): SqlAdapter {
  const lock = createLock();
  const exclusive = async <T>(run: () => Promise<T>): Promise<T> => {
    const release = await lock.acquire();
    try {
      return await run();
    } finally {
      release();
    }
  };
  return {
    provider: inner.provider,
    adapterName: inner.adapterName,
    queryRaw: (query) => exclusive(() => inner.queryRaw(query)),
    executeRaw: (query) => exclusive(() => inner.executeRaw(query)),
    executeScript: (script) => exclusive(() => inner.executeScript(script)),
    async startTransaction(isolationLevel) {
      const release = await lock.acquire();
      try {
        return wrapTransaction(await inner.startTransaction(isolationLevel), release);
      } catch (error) {
        release();
        throw error;
      }
    },
    ...(inner.getConnectionInfo ? { getConnectionInfo: () => inner.getConnectionInfo!() } : {}),
    dispose: () => inner.dispose(),
  };
}

/** The adapter factory Prisma gets: same as `inner`, but every connection it opens is serialized. */
export function serializedAdapterFactory(inner: AdapterFactory): AdapterFactory {
  return {
    provider: inner.provider,
    adapterName: inner.adapterName,
    connect: async () => serializeAdapter(await inner.connect()),
    connectToShadowDb: async () => serializeAdapter(await inner.connectToShadowDb()),
  };
}
