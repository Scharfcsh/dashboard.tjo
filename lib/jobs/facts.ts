import { getPool } from "@/lib/db/pool";
import type { UserFacts } from "@/lib/scoring/facts";
import { LIFECYCLE_CONFIG } from "@/lib/scoring/lifecycle-config";
import { CHECKOUT_ABANDON_MINUTES } from "@/lib/jobs/rollup";

// Builds scoring inputs from derived tables (plus the derived checkout_abandoned
// event). The scoring functions that consume these are pure.

interface FactsRow {
  user_id: string;
  is_paid: boolean;
  signup: Date | null;
  onboarded: Date | null;
  resume_uploaded: Date | null;
  first_auto_apply: Date | null;
  first_auto_apply_success: Date | null;
  activated: Date | null;
  thresholds: number[] | null;
  ever_power_user: boolean | null;
  used: number | null;
  usage_limit: number | null;
  pricing_views_30d: string | null;
  plan_clicks_30d: string | null;
  checkout_started_30d: string | null;
  sessions_7d: string | null;
  active_days_7d: string | null;
  auto_apply_started_7d: string | null;
  auto_apply_failed_7d: string | null;
  last_active_at: Date | null;
  payment_failed_unresolved: boolean | null;
  checkout_abandoned_7d: boolean;
  returned_after_inactivity: boolean | null;
  previous_stage: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const num = (v: string | number | null) => (v === null ? 0 : Number(v));

export async function loadFacts(userIds: string[], now = new Date()): Promise<UserFacts[]> {
  if (userIds.length === 0) return [];
  const { rows } = await getPool().query<FactsRow>(
    `SELECT t.user_id,
            is_paid_user(t.user_id) AS is_paid,
            ms.signup, ms.onboarded, ms.resume_uploaded, ms.first_auto_apply, ms.first_auto_apply_success,
            ms.activated, ms.thresholds, ms.ever_power_user,
            u.used, u.usage_limit,
            m.pricing_views_30d, m.plan_clicks_30d, m.checkout_started_30d, m.sessions_7d, m.active_days_7d,
            m.auto_apply_started_7d, m.auto_apply_failed_7d,
            usr.last_active_at,
            pay.payment_failed_unresolved,
            EXISTS (
              SELECT 1 FROM user_events a
              WHERE a.user_id = t.user_id AND a.event_name = 'checkout_abandoned'
                AND a.occurred_at > now() - interval '7 days'
                AND NOT EXISTS (
                  SELECT 1 FROM payment_events p
                  WHERE p.user_id = t.user_id AND p.status = 'success'
                    AND p.occurred_at > a.occurred_at - make_interval(mins => $3))
            ) AS checkout_abandoned_7d,
            ret.returned_after_inactivity,
            ls.stage AS previous_stage
     FROM unnest($1::text[]) AS t(user_id)
     LEFT JOIN users usr ON usr.user_id = t.user_id
     LEFT JOIN auto_apply_usage u ON u.user_id = t.user_id
     LEFT JOIN lifecycle_state ls ON ls.user_id = t.user_id
     LEFT JOIN LATERAL (
       SELECT max(first_at) FILTER (WHERE milestone = 'signup')                   AS signup,
              max(first_at) FILTER (WHERE milestone = 'onboarded')                AS onboarded,
              max(first_at) FILTER (WHERE milestone = 'resume_uploaded')          AS resume_uploaded,
              max(first_at) FILTER (WHERE milestone = 'first_auto_apply')         AS first_auto_apply,
              max(first_at) FILTER (WHERE milestone = 'first_auto_apply_success') AS first_auto_apply_success,
              max(first_at) FILTER (WHERE milestone = 'activated')                AS activated,
              array_agg(substr(milestone, 4)::int) FILTER (WHERE milestone ~ '^aa_[0-9]+$') AS thresholds,
              bool_or(milestone = 'lifecycle:power_user')                         AS ever_power_user
       FROM user_milestones WHERE user_id = t.user_id
     ) ms ON true
     LEFT JOIN LATERAL (
       SELECT sum(pricing_views)                                                           AS pricing_views_30d,
              sum(plan_clicks)                                                             AS plan_clicks_30d,
              sum(checkout_started)                                                        AS checkout_started_30d,
              sum(sessions_count) FILTER (WHERE business_date > business_today() - 7)      AS sessions_7d,
              count(*) FILTER (WHERE is_active AND business_date > business_today() - 7)   AS active_days_7d,
              sum(auto_apply_started) FILTER (WHERE business_date > business_today() - 7)  AS auto_apply_started_7d,
              sum(auto_apply_failed) FILTER (WHERE business_date > business_today() - 7)   AS auto_apply_failed_7d
       FROM user_daily_metrics
       WHERE user_id = t.user_id AND business_date > business_today() - 30
     ) m ON true
     LEFT JOIN LATERAL (
       SELECT (p.status = 'failed') AS payment_failed_unresolved
       FROM payment_events p
       WHERE p.user_id = t.user_id AND p.occurred_at > now() - interval '30 days'
       ORDER BY p.occurred_at DESC LIMIT 1
     ) pay ON true
     LEFT JOIN LATERAL (
       SELECT bool_or(d.business_date > business_today() - $4::int
                      AND d.prev IS NOT NULL AND d.business_date - d.prev >= $2::int) AS returned_after_inactivity
       FROM (
         SELECT business_date, lag(business_date) OVER (ORDER BY business_date) AS prev
         FROM user_daily_metrics WHERE user_id = t.user_id AND is_active
       ) d
     ) ret ON true`,
    [userIds, LIFECYCLE_CONFIG.dormantAfterDays, CHECKOUT_ABANDON_MINUTES, LIFECYCLE_CONFIG.resurrectedWindowDays]
  );

  return rows.map((r) => ({
    userId: r.user_id,
    isPaid: r.is_paid,
    signupAt: iso(r.signup),
    onboardedAt: iso(r.onboarded),
    resumeUploadedAt: iso(r.resume_uploaded),
    firstAutoApplyAt: iso(r.first_auto_apply),
    firstAutoApplySuccessAt: iso(r.first_auto_apply_success),
    activatedAt: iso(r.activated),
    autoApplyUsed: r.used ?? 0,
    usageLimit: r.usage_limit ?? 50,
    thresholdsReached: r.thresholds ?? [],
    autoApplyStarted7d: num(r.auto_apply_started_7d),
    autoApplyFailed7d: num(r.auto_apply_failed_7d),
    pricingViews30d: num(r.pricing_views_30d),
    planClicks30d: num(r.plan_clicks_30d),
    checkoutStarted30d: num(r.checkout_started_30d),
    paymentFailedUnresolved: r.payment_failed_unresolved ?? false,
    checkoutAbandoned7d: r.checkout_abandoned_7d,
    sessions7d: num(r.sessions_7d),
    activeDays7d: num(r.active_days_7d),
    lastActiveAt: iso(r.last_active_at),
    daysSinceActive: r.last_active_at ? Math.floor((now.getTime() - r.last_active_at.getTime()) / 86_400_000) : null,
    returnedAfterInactivity: r.returned_after_inactivity ?? false,
    previousStage: r.previous_stage,
    everPowerUser: r.ever_power_user ?? false,
  }));
}
