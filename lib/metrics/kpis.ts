import { queryOne } from "@/lib/db/pool";
import { userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import { HOT_PQL_MIN_SCORE } from "@/lib/scoring/pql-config";
import type { DateRange } from "@/lib/time/business-time";

// ---------------------------------------------------------------------------
// One function per metric (definitions in lib/metrics/definitions.ts). They read
// derived tables only - never user_events.
// ---------------------------------------------------------------------------

type Period = { from: string; to: string; startUtc: Date; endUtc: Date };

const n = (v: unknown) => Number(v ?? 0);

async function scalar(sql: string, params: unknown[]): Promise<number> {
  const row = await queryOne<{ n: string }>(sql, params);
  return n(row?.n);
}

export function totalUsers(period: Period, f: UserFilters) {
  const p: unknown[] = [period.endUtc];
  return scalar(
    `SELECT count(*) AS n FROM users u WHERE COALESCE(u.signup_at, u.first_seen_at) < $1${userFilterSql(f, p)}`,
    p
  );
}

export function newUsers(period: Period, f: UserFilters) {
  const p: unknown[] = [period.startUtc, period.endUtc];
  return scalar(
    `SELECT count(*) AS n FROM users u WHERE u.signup_at >= $1 AND u.signup_at < $2${userFilterSql(f, p)}`,
    p
  );
}

/** Distinct users matching a user_daily_metrics predicate on business dates in the period. */
function dailyDistinct(predicate: string) {
  return (period: Period, f: UserFilters) => {
    const p: unknown[] = [period.from, period.to];
    return scalar(
      `SELECT count(DISTINCT d.user_id) AS n
       FROM user_daily_metrics d JOIN users u ON u.user_id = d.user_id
       WHERE d.business_date BETWEEN $1::date AND $2::date AND ${predicate}${userFilterSql(f, p)}`,
      p
    );
  };
}

function dailySum(column: string) {
  return (period: Period, f: UserFilters) => {
    const p: unknown[] = [period.from, period.to];
    return scalar(
      `SELECT COALESCE(sum(d.${column}), 0) AS n
       FROM user_daily_metrics d JOIN users u ON u.user_id = d.user_id
       WHERE d.business_date BETWEEN $1::date AND $2::date${userFilterSql(f, p)}`,
      p
    );
  };
}

export const activeUsers = dailyDistinct("d.is_active");
export const pricingVisitors = dailyDistinct("d.pricing_views > 0");
export const pricingViews = dailySum("pricing_views");
export const checkoutStarters = dailyDistinct("d.checkout_started > 0");
export const checkoutAbandoners = dailyDistinct("d.checkout_abandoned > 0");
export const payingUsersCharged = dailyDistinct("d.payments_success > 0");
export const paymentFailedUsers = dailyDistinct("d.payments_failed > 0");
export const coreFeatureUsers = dailyDistinct("d.auto_apply_success > 0");
export const revenue = dailySum("revenue_amount");

export function paidConversions(period: Period, f: UserFilters) {
  const p: unknown[] = [period.startUtc, period.endUtc];
  return scalar(
    `SELECT count(*) AS n FROM user_milestones m JOIN users u ON u.user_id = m.user_id
     WHERE m.milestone = 'first_paid' AND m.first_at >= $1 AND m.first_at < $2${userFilterSql(f, p)}`,
    p
  );
}

export function returnedUsers(period: Period, f: UserFilters) {
  const p: unknown[] = [period.startUtc, period.endUtc];
  return scalar(
    `SELECT count(DISTINCT h.user_id) AS n FROM lifecycle_history h JOIN users u ON u.user_id = h.user_id
     WHERE h.to_stage = 'resurrected' AND h.transitioned_at >= $1 AND h.transitioned_at < $2${userFilterSql(f, p)}`,
    p
  );
}

// --------------------------------------------------------------------------- snapshots (not range-bound)

export function hotPqls(f: UserFilters) {
  const p: unknown[] = [HOT_PQL_MIN_SCORE];
  return scalar(
    `SELECT count(*) AS n FROM pql_scores s JOIN users u ON u.user_id = s.user_id
     WHERE s.score >= $1 AND NOT s.is_paid${userFilterSql(f, p)}`,
    p
  );
}

export function paidUsersNow(f: UserFilters) {
  const p: unknown[] = [];
  return scalar(`SELECT count(*) AS n FROM users u WHERE is_paid_user(u.user_id)${userFilterSql(f, p)}`, p);
}

export function unpaidUsageAtLeast(threshold: number | "limit", f: UserFilters) {
  const p: unknown[] = [];
  let cond: string;
  if (threshold === "limit") cond = "a.used >= a.usage_limit";
  else {
    p.push(threshold);
    cond = "a.used >= $1";
  }
  return scalar(
    `SELECT count(*) AS n FROM auto_apply_usage a JOIN users u ON u.user_id = a.user_id
     WHERE ${cond} AND NOT is_paid_user(a.user_id)${userFilterSql(f, p)}`,
    p
  );
}

export function dormant3d(f: UserFilters) {
  const p: unknown[] = [];
  return scalar(
    `SELECT count(*) AS n FROM users u
     WHERE u.last_active_at < now() - interval '3 days' AND u.last_active_at >= now() - interval '30 days'
       AND NOT is_paid_user(u.user_id)${userFilterSql(f, p)}`,
    p
  );
}

/** Run a metric for the range and its previous period. */
export async function withPrevious(
  fn: (period: Period, f: UserFilters) => Promise<number>,
  range: DateRange,
  f: UserFilters
): Promise<[number, number]> {
  return Promise.all([fn(range, f), fn(range.previous, f)]);
}
