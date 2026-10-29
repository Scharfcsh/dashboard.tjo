import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { getConfig } from "@/lib/config";

// JSON numbers, not strings: count(*)/bigserial (int8) and numeric amounts. Counts
// and ids stay far below 2^53, and amounts are 2-decimal currency values.
types.setTypeParser(types.builtins.INT8, (v) => Number(v));
types.setTypeParser(types.builtins.NUMERIC, (v) => Number(v));

// ---------------------------------------------------------------------------
// One pg Pool per server process. Cached on globalThis so dev hot reloads do not
// leak pools. Every connection gets the business timezone as a session setting,
// which the SQL helpers business_date()/business_today() read - that is what
// keeps "today" identical in TypeScript and in SQL.
// ---------------------------------------------------------------------------

const globalForPool = globalThis as unknown as { __eventsPool?: Pool };

export function getPool(): Pool {
  if (globalForPool.__eventsPool) return globalForPool.__eventsPool;

  const config = getConfig();
  const pool = new Pool({
    connectionString: config.EVENTS_DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Postgres applies these at connection start - no extra round trip per checkout.
    options:
      `-c app.business_timezone=${config.BUSINESS_TIMEZONE} -c app.online_window_seconds=${config.ONLINE_WINDOW_SECONDS} -c timezone=UTC` +
      (config.EVENTS_DATABASE_READ_ONLY ? " -c default_transaction_read_only=on" : ""),
  });
  pool.on("error", (err) => console.error("[db] idle client error", err));

  globalForPool.__eventsPool = pool;
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

export async function queryRows<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return (await getPool().query<T>(text, params)).rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return (await getPool().query<T>(text, params)).rows[0] ?? null;
}

export type Queryable = Pick<PoolClient, "query">;

/** Run `fn` in a transaction; rolls back on throw. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
