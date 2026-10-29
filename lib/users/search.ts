import "server-only";
import { searchUserIds } from "@/lib/user-details";

/**
 * Search-box filter on `users u`: id, name, email or phone digits. Names and
 * emails mostly live in the product database, so the users it matches there are
 * added by id. `base` is the number of parameters already bound, so the clause
 * can be appended to any query.
 */
export async function userSearchClause(query: string, base: number): Promise<{ sql: string; params: unknown[] }> {
  const q = query.trim();
  if (!q) return { sql: "", params: [] };
  const params: unknown[] = [`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`, await searchUserIds(q)];
  const like = `$${base + 1}`;
  let sql = ` AND (u.user_id ILIKE ${like} OR u.name ILIKE ${like} OR u.email ILIKE ${like} OR u.user_id = ANY($${base + 2}::text[])`;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3) {
    params.push(`%${digits}%`);
    sql += ` OR regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE $${base + 3}`;
  }
  return { sql: `${sql})`, params };
}
