import { Pool } from "pg";
import { getConfig } from "@/lib/config";

// ---------------------------------------------------------------------------
// Connection to the product database that owns the "User" table. It belongs to
// another service, so this app only ever reads from it: every connection starts
// read-only and Postgres rejects any write. Null when USER_DETAIL_DB is unset.
// ---------------------------------------------------------------------------

const globalForPool = globalThis as unknown as { __userDetailPool?: Pool | null };

export function getUserDetailPool(): Pool | null {
  if (globalForPool.__userDetailPool !== undefined) return globalForPool.__userDetailPool;

  const url = getConfig().USER_DETAIL_DB;
  if (!url) {
    globalForPool.__userDetailPool = null;
    return null;
  }
  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    options: "-c default_transaction_read_only=on -c timezone=UTC",
  });
  pool.on("error", (err) => console.error("[user-details] idle client error", err));

  globalForPool.__userDetailPool = pool;
  return pool;
}
