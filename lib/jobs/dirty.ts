import { getPool } from "@/lib/db/pool";

// ---------------------------------------------------------------------------
// Which derived rows need recomputing.
//
//   window mode  - events *received* in (lower, upper], plus anonymous history
//                  newly attributed by identity links created in that window
//   range mode   - events that *occurred* on business dates [from, to]
//                  (nightly re-rollup and manual backfill)
// ---------------------------------------------------------------------------

export interface DirtySet {
  /** Distinct (user, business date) pairs. */
  userDates: { userId: string; date: string }[];
  users: string[];
  sessions: string[];
}

export type DirtyScope =
  | { kind: "window"; lower: Date; upper: Date }
  | { kind: "range"; from: string; to: string; userId?: string };

export async function findDirty(scope: DirtyScope): Promise<DirtySet> {
  const pool = getPool();
  let pairs: { user_id: string; d: string }[];
  let sessions: { session_id: string }[];

  if (scope.kind === "window") {
    const params = [scope.lower, scope.upper];
    pairs = (
      await pool.query(
        `SELECT DISTINCT user_id, d FROM (
           SELECT e.user_id, business_date(e.occurred_at)::text AS d
           FROM user_events e
           WHERE e.received_at > $1 AND e.received_at <= $2 AND e.user_id IS NOT NULL
           UNION ALL
           SELECT il.user_id, business_date(e.occurred_at)::text
           FROM user_events e JOIN identity_links il ON il.anonymous_id = e.anonymous_id
           WHERE e.received_at > $1 AND e.received_at <= $2 AND e.user_id IS NULL
           UNION ALL
           SELECT il.user_id, business_date(e.occurred_at)::text
           FROM identity_links il JOIN user_events e ON e.anonymous_id = il.anonymous_id AND e.user_id IS NULL
           WHERE il.created_at > $1 AND il.created_at <= $2
         ) x`,
        params
      )
    ).rows;
    sessions = (
      await pool.query(
        `SELECT DISTINCT session_id FROM user_events
         WHERE received_at > $1 AND received_at <= $2 AND session_id IS NOT NULL AND ingest_source = 'client'`,
        params
      )
    ).rows;
  } else {
    const params: unknown[] = [scope.from, scope.to, scope.userId ?? null];
    const bounds = `e.occurred_at >= business_day_start($1::date) AND e.occurred_at < business_day_start($2::date + 1)`;
    pairs = (
      await pool.query(
        `SELECT DISTINCT user_id, d FROM (
           SELECT COALESCE(e.user_id, il.user_id) AS user_id, business_date(e.occurred_at)::text AS d
           FROM user_events e
           LEFT JOIN identity_links il ON e.user_id IS NULL AND il.anonymous_id = e.anonymous_id
           WHERE ${bounds}
         ) x
         WHERE user_id IS NOT NULL AND ($3::text IS NULL OR user_id = $3)`,
        params
      )
    ).rows;
    sessions = (
      await pool.query(
        `SELECT DISTINCT e.session_id FROM user_events e
         LEFT JOIN identity_links il ON e.user_id IS NULL AND il.anonymous_id = e.anonymous_id
         WHERE ${bounds} AND e.session_id IS NOT NULL AND e.ingest_source = 'client'
           AND ($3::text IS NULL OR COALESCE(e.user_id, il.user_id) = $3)`,
        params
      )
    ).rows;
  }

  return {
    userDates: pairs.map((p) => ({ userId: p.user_id, date: p.d })),
    users: [...new Set(pairs.map((p) => p.user_id))],
    sessions: sessions.map((s) => s.session_id),
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
