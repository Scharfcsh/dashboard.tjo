import { queryOne } from "@/lib/db/pool";
import { pct } from "@/lib/metrics/definitions";
import { userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import * as K from "@/lib/metrics/kpis";
import type { DateRange } from "@/lib/time/business-time";

// ---------------------------------------------------------------------------
// Conversion-rate intelligence for the Founder dashboard footer. Rates reuse the
// canonical KPI functions (lib/metrics/kpis.ts); retention matches the cohort
// definition used by /api/analytics/retention-cohorts (active exactly on
// signup date + N, only for signups whose day N is complete).
// ---------------------------------------------------------------------------

type Period = { from: string; to: string; startUtc: Date; endUtc: Date };

export interface PeriodRates {
  activation_rate: number | null;
  d1_retention: number | null;
  d7_retention: number | null;
  free_to_paid: number | null;
  pricing_to_checkout: number | null;
  checkout_to_paid: number | null;
  arppu: number | null;
}

async function signupRates(period: Period, f: UserFilters) {
  const p: unknown[] = [period.startUtc, period.endUtc];
  const filter = userFilterSql(f, p);
  const row = await queryOne<Record<string, number>>(
    `SELECT count(*)::int AS signups,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_milestones m WHERE m.user_id = u.user_id AND m.milestone = 'activated'))::int AS activated,
            count(*) FILTER (WHERE business_date(u.signup_at) + 1 < business_today())::int AS d1_eligible,
            count(*) FILTER (WHERE business_date(u.signup_at) + 1 < business_today() AND EXISTS (
              SELECT 1 FROM user_daily_metrics d WHERE d.user_id = u.user_id AND d.is_active
                AND d.business_date = business_date(u.signup_at) + 1))::int AS d1_retained,
            count(*) FILTER (WHERE business_date(u.signup_at) + 7 < business_today())::int AS d7_eligible,
            count(*) FILTER (WHERE business_date(u.signup_at) + 7 < business_today() AND EXISTS (
              SELECT 1 FROM user_daily_metrics d WHERE d.user_id = u.user_id AND d.is_active
                AND d.business_date = business_date(u.signup_at) + 7))::int AS d7_retained
     FROM users u
     WHERE u.signup_at >= $1 AND u.signup_at < $2${filter}`,
    p
  );
  return row ?? {};
}

export async function periodRates(period: Period, f: UserFilters): Promise<PeriodRates> {
  const [signups, active, pricing, checkout, paid, revenue, charged] = await Promise.all([
    signupRates(period, f),
    K.activeUsers(period, f),
    K.pricingVisitors(period, f),
    K.checkoutStarters(period, f),
    K.paidConversions(period, f),
    K.revenue(period, f),
    K.payingUsersCharged(period, f),
  ]);
  return {
    activation_rate: pct(signups.activated ?? 0, signups.signups ?? 0),
    d1_retention: pct(signups.d1_retained ?? 0, signups.d1_eligible ?? 0),
    d7_retention: pct(signups.d7_retained ?? 0, signups.d7_eligible ?? 0),
    free_to_paid: pct(paid, active),
    pricing_to_checkout: pct(checkout, pricing),
    checkout_to_paid: pct(paid, checkout),
    arppu: charged === 0 ? null : Math.round(revenue / charged),
  };
}

/** Average current PQL score of unpaid users active in the period (snapshot score). */
export async function averagePqlScore(period: Period, f: UserFilters): Promise<number | null> {
  const p: unknown[] = [period.from, period.to];
  const filter = userFilterSql(f, p);
  const row = await queryOne<{ avg: number | null }>(
    `SELECT round(avg(s.score))::int AS avg
     FROM pql_scores s JOIN users u ON u.user_id = s.user_id
     WHERE NOT s.is_paid AND EXISTS (
       SELECT 1 FROM user_daily_metrics d WHERE d.user_id = s.user_id AND d.is_active
         AND d.business_date BETWEEN $1::date AND $2::date)${filter}`,
    p
  );
  return row?.avg ?? null;
}

export async function intelligenceMetrics(range: DateRange, f: UserFilters) {
  const [current, previous, avgPql] = await Promise.all([
    periodRates(range, f),
    periodRates(range.previous, f),
    averagePqlScore(range, f),
  ]);
  return { current, previous, avgPql };
}
