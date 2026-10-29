import "server-only";
import { getUserDetailPool } from "@/lib/user-details/pool";
import { mergeUserDetails, type DetailKeys, type UserDetail } from "@/lib/user-details/merge";

export type { UserDetail } from "@/lib/user-details/merge";

// ---------------------------------------------------------------------------
// Names, emails and phones live in the product's "User" table, keyed by Clerk
// id - the same id the analytics database uses as users.user_id. The two are in
// separate databases, so rows are enriched after the analytics query runs.
//
// Never fatal: if the product database is not configured or not reachable the
// dashboards keep rendering, with user ids where names would be.
// ---------------------------------------------------------------------------

const TTL_MS = 60_000;
const MAX_CACHED = 5_000;

interface CacheEntry {
  detail: UserDetail | null; // null = known not to exist
  at: number;
}

const g = globalThis as unknown as { __userDetailCache?: Map<string, CacheEntry>; __userDetailWarned?: boolean };
const cache = (g.__userDetailCache ??= new Map());

function warnOnce(err: unknown) {
  if (g.__userDetailWarned) return;
  g.__userDetailWarned = true;
  console.warn("[user-details] product database unavailable, showing user ids:", (err as Error).message);
}

const COLUMNS = `"clerkId", name, email, phone, location, headline, skills, username, onboarded, "lastSeenAt",
  plan::text AS plan, "planStatus"::text AS "planStatus", "billingCycle"::text AS "billingCycle",
  "currentPeriodEnd", "premiumUntil", "proUntil", "paymentProvider"::text AS "paymentProvider"`;

function toDetail(r: Record<string, unknown>): UserDetail {
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const date = (v: unknown) => (v instanceof Date ? v : null);
  return {
    clerkId: String(r.clerkId),
    name: str(r.name),
    email: str(r.email),
    phone: str(r.phone),
    location: str(r.location),
    headline: str(r.headline),
    skills: Array.isArray(r.skills) ? r.skills.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [],
    username: str(r.username),
    onboarded: Boolean(r.onboarded),
    lastSeenAt: date(r.lastSeenAt),
    plan: str(r.plan),
    planStatus: str(r.planStatus),
    billingCycle: str(r.billingCycle),
    currentPeriodEnd: date(r.currentPeriodEnd),
    premiumUntil: date(r.premiumUntil),
    proUntil: date(r.proUntil),
    paymentProvider: str(r.paymentProvider),
  };
}

/** Details for the given Clerk ids. Missing ids are simply absent from the map. */
export async function getUserDetails(clerkIds: Iterable<string | null | undefined>): Promise<Map<string, UserDetail>> {
  const out = new Map<string, UserDetail>();
  const pool = getUserDetailPool();
  if (!pool) return out;

  const now = Date.now();
  const missing: string[] = [];
  for (const id of new Set(clerkIds)) {
    if (!id) continue;
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL_MS) {
      if (hit.detail) out.set(id, hit.detail);
    } else {
      missing.push(id);
    }
  }
  if (missing.length === 0) return out;

  try {
    const { rows } = await pool.query(`SELECT ${COLUMNS} FROM "User" WHERE "clerkId" = ANY($1::text[])`, [missing]);
    g.__userDetailWarned = false;
    const found = new Map(rows.map((r) => [String(r.clerkId), toDetail(r)]));
    if (cache.size + missing.length > MAX_CACHED) cache.clear();
    for (const id of missing) {
      const detail = found.get(id) ?? null;
      cache.set(id, { detail, at: now });
      if (detail) out.set(id, detail);
    }
  } catch (err) {
    warnOnce(err);
  }
  return out;
}

export async function getUserDetail(clerkId: string): Promise<UserDetail | null> {
  return (await getUserDetails([clerkId])).get(clerkId) ?? null;
}

/**
 * Fills name/email/phone on analytics rows from the product database. See
 * mergeUserDetails for the rules; `keys` names the row's fields when they are
 * not the default user_id/name/email/phone.
 */
export async function withUserDetails<T extends object>(rows: T[], keys: DetailKeys = {}): Promise<T[]> {
  if (rows.length === 0) return rows;
  const idKey = keys.id ?? "user_id";
  const details = await getUserDetails(rows.map((r) => (r as Record<string, unknown>)[idKey] as string | null));
  return mergeUserDetails(rows, details, keys);
}

/**
 * Clerk ids of users whose name, email, username or phone matches. Search used
 * to run inside the analytics SQL, but those columns are empty there, so a
 * search box adds `OR u.user_id = ANY(<these ids>)`.
 */
export async function searchUserIds(term: string, limit = 200): Promise<string[]> {
  const pool = getUserDetailPool();
  const q = term.trim();
  if (!pool || q.length < 2) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "");
  try {
    const { rows } = await pool.query<{ clerkId: string }>(
      `SELECT "clerkId" FROM "User"
       WHERE "clerkId" IS NOT NULL
         AND (email ILIKE $1 OR name ILIKE $1 OR username ILIKE $1
              OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%'))
       LIMIT ${Math.max(1, Math.min(limit, 1000))}`,
      [like, digits.length >= 4 ? digits : ""]
    );
    return rows.map((r) => r.clerkId);
  } catch (err) {
    warnOnce(err);
    return [];
  }
}
