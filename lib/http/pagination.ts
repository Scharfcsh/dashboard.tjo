import { z } from "zod";
import { ApiError } from "@/lib/http/errors";

// ---------------------------------------------------------------------------
// Two pagination styles, one response shape:
//   { data: [...], page: { limit, next_cursor } }            keyset (events, sessions, history)
//   { data: [...], page: { limit, offset, total } }          offset (leads, alerts, cohorts, rules)
//
// Keyset cursors are opaque base64url of (sort timestamp, tiebreak id). Rows are
// always ordered (ts DESC, id DESC), so the next page is `(ts, id) < (cursor)`.
// ---------------------------------------------------------------------------

export const MAX_LIMIT = 200;

export const cursorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
  cursor: z.string().optional(),
});

export const offsetQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface Cursor {
  ts: string;
  id: string;
}

export function encodeCursor(ts: Date | string, id: string | number): string {
  const iso = ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString();
  return Buffer.from(JSON.stringify([iso, String(id)])).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): Cursor | null {
  if (!cursor) return null;
  try {
    const [ts, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [string, string];
    if (typeof ts !== "string" || typeof id !== "string" || Number.isNaN(Date.parse(ts))) throw new Error();
    return { ts, id };
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Invalid cursor");
  }
}

/**
 * Given rows fetched with LIMIT limit+1, trim the probe row and build the page.
 * `key` extracts the (ts, id) the query sorts by.
 */
export function keysetPage<T>(rows: T[], limit: number, key: (row: T) => [Date | string, string | number]) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    page: { limit, next_cursor: hasMore && last ? encodeCursor(...key(last)) : null },
  };
}

export function offsetPage<T>(rows: T[], limit: number, offset: number, total: number) {
  return { data: rows, page: { limit, offset, total, next_offset: offset + rows.length < total ? offset + rows.length : null } };
}
