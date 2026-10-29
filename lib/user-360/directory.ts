import "server-only";
import { queryOne, queryRows } from "@/lib/db/pool";
import { applyPii } from "@/lib/pii";
import { checkAvailability } from "@/lib/revenue-center/load";
import { mockDirectory } from "@/lib/user-360/mock";
import type { DirectoryData, DirectoryRow } from "@/lib/user-360/types";
import { withUserDetails } from "@/lib/user-details";
import { userSearchClause } from "@/lib/users/search";
import { USER_SUMMARY_COLUMNS, USER_SUMMARY_JOINS, type UserSummaryRow } from "@/lib/users/summary";

/** Landing page for User 360: search any user, ranked by how valuable they are. */
export async function loadDirectory(query: string, limit = 25, offset = 0): Promise<DirectoryData> {
  const availability = await checkAvailability();
  if (!availability.ok) return mockDirectory(query, availability.reason);
  try {
    const search = await userSearchClause(query, 2);
    const count = await userSearchClause(query, 0);
    const [raw, total] = await Promise.all([
      queryRows<UserSummaryRow>(
        `SELECT ${USER_SUMMARY_COLUMNS} FROM users u ${USER_SUMMARY_JOINS}
         WHERE true${search.sql}
         ORDER BY ps.priority ASC NULLS LAST, COALESCE(ps.score, 0) DESC, u.last_active_at DESC NULLS LAST
         LIMIT $1 OFFSET $2`,
        [limit, offset, ...search.params]
      ),
      queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM users u WHERE true${count.sql}`, count.params),
    ]);
    const rows = await withUserDetails(raw);
    return {
      source: { kind: "live" },
      generatedAt: new Date().toISOString(),
      query,
      rows: rows.map((r): DirectoryRow => {
        const pii = applyPii({ email: r.email, phone: r.phone }, false);
        return {
          userId: r.user_id,
          displayId: r.user_id,
          name: r.name ?? r.user_id,
          email: pii.email,
          country: r.country,
          plan: r.plan,
          isPaid: r.is_paid,
          isOnline: r.is_online,
          lifecycleStage: r.lifecycle_stage,
          pqlScore: r.pql_score,
          priority: r.priority as DirectoryRow["priority"],
          autoApplyUsed: r.auto_apply_used,
          autoApplyLimit: r.auto_apply_limit,
          lastActiveAt: r.last_active_at?.toISOString() ?? null,
          ownerName: r.owner_name,
        };
      }),
      total: total?.n ?? rows.length,
    };
  } catch (err) {
    console.error("[user-360] directory load failed, using demo data", err);
    return mockDirectory(query, "Live data failed to load — showing demo data.");
  }
}
