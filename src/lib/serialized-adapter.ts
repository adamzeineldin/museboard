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
//
// The lock only covers this process; the worker is a second process on the same file. With `immediate`, every
// transaction takes SQLite's write lock up front (BEGIN IMMEDIATE), which waits on the busy timeout. The
// adapter's own deferred BEGIN would instead fail with SQLITE_BUSY at once when a transaction that has read
// tries to write while the other process holds the write lock.
//
// better-sqlite3 is synchronous: while a statement waits on the busy timeout (15s, see ./prisma-client.ts) for
// the worker's write lock, it blocks the event loop, so the whole web process stalls, not just that request.
// TODO(postgres): an async driver (@prisma/adapter-pg) removes this stall along with this wrapper.

type AdapterFactory = Pick<PrismaBetterSqlite3, "provider" | "adapterName" | "connect" | "connectToShadowDb">;
type SqlAdapter = Awaited<ReturnType<PrismaBetterSqlite3["connect"]>>;
type SqlTransaction = Awaited<ReturnType<SqlAdapter["startTransaction"]>>;
type Release = () => void;

export interface SerializeOptions {
  /** Re-open each transaction as BEGIN IMMEDIATE (the adapter starts a deferred one). */
  immediate?: boolean;
}

export interface SerializedFactoryOptions extends SerializeOptions {
  /** SQL run once on each new (non-shadow) connection, e.g. PRAGMAs. */
  connectScript?: string;
}

const statement = (sql: string) => ({ sql, args: [], argTypes: [] });

/** Swap the adapter's deferred BEGIN (no locks taken yet) for BEGIN IMMEDIATE on the same connection. */
async function beginImmediate(tx: SqlTransaction): Promise<void> {
  try {
    await tx.executeRaw(statement("COMMIT"));
    await tx.executeRaw(statement("BEGIN IMMEDIATE"));
  } catch (error) {
    // No transaction is open on the connection now; this only releases the adapter's own mutex.
    await tx.rollback();
    throw error;
  }
}

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
export function serializeAdapter(inner: SqlAdapter, options: SerializeOptions = {}): SqlAdapter {
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
        const tx = await inner.startTransaction(isolationLevel);
        if (options.immediate) await beginImmediate(tx);
        return wrapTransaction(tx, release);
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
export function serializedAdapterFactory(inner: AdapterFactory, options: SerializedFactoryOptions = {}): AdapterFactory {
  const { connectScript, ...serializeOptions } = options;
  return {
    provider: inner.provider,
    adapterName: inner.adapterName,
    async connect() {
      const connection = await inner.connect();
      if (connectScript) await connection.executeScript(connectScript);
      return serializeAdapter(connection, serializeOptions);
    },
    connectToShadowDb: async () => serializeAdapter(await inner.connectToShadowDb(), serializeOptions),
  };
}
