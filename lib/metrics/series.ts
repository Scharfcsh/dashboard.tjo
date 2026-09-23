import { queryRows } from "@/lib/db/pool";
import { userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import { HOT_PQL_MIN_SCORE } from "@/lib/scoring/pql-config";

export interface GrowthRow {
  date: string;
  active: number;
  pqls: number;
  paid: number;
}

/**
 * Daily series for the last `days` business dates (see METRIC_DEFINITIONS):
 *   active  - active_users on that date
 *   pqls    - users whose latest PQL score as of that day's end was >= HOT_PQL_MIN_SCORE
 *   paid    - users holding a subscription that had started and not been cancelled by that day's end
 */
export async function growthSeries(days: number, f: UserFilters): Promise<GrowthRow[]> {
  const p: unknown[] = [days, HOT_PQL_MIN_SCORE];
  const filter = userFilterSql(f, p);
  return queryRows<GrowthRow>(
    `WITH days AS (
       SELECT d::date AS d, business_day_start(d::date + 1) AS day_end
       FROM generate_series(business_today() - ($1::int - 1), business_today(), interval '1 day') AS d
     )
     SELECT days.d::text AS date,
            (SELECT count(DISTINCT m.user_id)::int FROM user_daily_metrics m JOIN users u ON u.user_id = m.user_id
              WHERE m.business_date = days.d AND m.is_active${filter}) AS active,
            (SELECT count(*)::int FROM (
               SELECT DISTINCT ON (h.user_id) h.score
               FROM pql_score_history h JOIN users u ON u.user_id = h.user_id
               WHERE h.computed_at < days.day_end${filter}
               ORDER BY h.user_id, h.computed_at DESC, h.id DESC
             ) latest WHERE latest.score >= $2) AS pqls,
            (SELECT count(DISTINCT s.user_id)::int FROM subscriptions s JOIN users u ON u.user_id = s.user_id
              WHERE s.started_at < days.day_end AND (s.cancelled_at IS NULL OR s.cancelled_at >= days.day_end)${filter}) AS paid
     FROM days ORDER BY days.d`,
    p
  );
}
