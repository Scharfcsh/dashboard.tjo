import { HOT_PQL_MIN_SCORE } from "@/lib/scoring/pql-config";
import { LIFECYCLE_CONFIG } from "@/lib/scoring/lifecycle-config";

// ---------------------------------------------------------------------------
// Metric definitions registry. Every aggregate a response returns is named here,
// and responses echo the definitions of what they return (`definitions: {...}`),
// so "active" or "paid" can never quietly mean two things on two dashboards.
// The SQL that implements each lives in lib/metrics/*.ts - one function per metric.
// ---------------------------------------------------------------------------

export const METRIC_DEFINITIONS = {
  total_users: "Identified users (a Clerk user_id seen in any event) whose signup - or first event when signup is unknown - is before the end of the range.",
  new_users: "Users whose signup_at falls inside the range (business timezone).",
  active_users:
    "Distinct users with at least one meaningful event on a business date in the range. Meaningful = user-initiated product action (lib/events/catalog.ts); heartbeats, page views, webhooks, worker outcomes and identity syncs do not count.",
  online_users: "Users whose last browser event (or user-initiated server event) is within ONLINE_WINDOW_SECONDS of now.",
  hot_pqls: `Unpaid users whose current PQL score is >= ${HOT_PQL_MIN_SCORE} (pql_scores). Current snapshot - not range-bound.`,
  pricing_visitors: "Distinct users with at least one pricing_viewed event in the range.",
  pricing_views: "Total pricing_viewed events in the range.",
  checkout_started: "Distinct users who started checkout in the range (browser and server copies of one attempt count once).",
  checkout_abandoned: "Distinct users with a derived checkout_abandoned (no payment 30 minutes after checkout_started) in the range.",
  paid_conversions: "Users whose first successful payment/subscription start (milestone first_paid) is in the range.",
  paying_users_charged: "Distinct users with a successful payment (including renewals) in the range.",
  revenue: "Sum of successful payment amounts in the range, in major currency units, de-duplicated by provider event.",
  payment_failed_users: "Distinct users with a failed payment in the range.",
  paid_users: "Users with a subscription in status active/authenticated/pending whose current period has not ended (SQL is_paid_user()).",
  free_applies_40_plus: "Unpaid users with 40 or more free Auto Applies used (auto_apply_usage.used). Current snapshot.",
  free_applies_45_plus: "Unpaid users with 45 or more free Auto Applies used. Current snapshot.",
  quota_exhausted: "Unpaid users with used >= usage limit (50). Current snapshot.",
  dormant_3d: "Unpaid users whose last meaningful activity was between 3 and 30 days ago. Current snapshot.",
  returned_users: "Users who transitioned into the resurrected lifecycle stage during the range.",
  activated_users: `Users with the 'activated' milestone: resume uploaded + a job interaction + first successful Auto Apply.`,
  core_feature_users: "Users with at least one successful Auto Apply in the range.",
  pql_users: `Users whose current PQL score is >= ${HOT_PQL_MIN_SCORE}.`,
  lifecycle_stage: `Current stage from lifecycle_state (rules in lib/scoring/lifecycle.ts; dormant after ${LIFECYCLE_CONFIG.dormantAfterDays} days without meaningful activity).`,
  auto_apply_used:
    "Free Auto Applies consumed: the latest count reported by the main app plus successes since; falls back to the success count when never reported (used_basis).",
  usage_stage: "Bucket of auto_apply_used: 0-10, 11-25, 26-39, 40-44, 45-49, 50 (50 = at or above the limit).",
  free_applies_remaining: "usage limit minus auto_apply_used, floored at 0. The only definition of 'remaining' - a 50/50 user always shows 0.",
  pql_band: "PQL score band from lib/scoring/pql-config.ts: Buy Now 90+, Hot 75-89, Warm 60-74, Engaged 40-59, Early below 40.",
  pql_reason: "A scoring rule that currently contributes points to a user's score, read from the stored pql_scores.reasons so the breakdown always agrees with the score.",
  converted_after_limit: "Users who reached 50/50 free Auto Applies and whose first payment came after that moment.",
  market_conversion: "Per country: signups in the range, and how many reached activation, 40+ usage, pricing, checkout and payment (milestones, any time since).",
  experiment_conversion: "Share of users assigned to an experiment variant whose first payment came after the assignment.",
  retention_dn:
    "Share of a signup cohort (signup week, Monday start, business timezone) active exactly N days after their signup date. Null when day N is not yet complete for the whole cohort.",
  activation_rate: "Share of the cohort that reached the activated milestone.",
  growth_pqls: `Users whose latest PQL score as of each day's end was >= ${HOT_PQL_MIN_SCORE} (from pql_score_history).`,
  growth_paid_users: "Users holding a subscription that had started and was not cancelled by each day's end.",
  free_to_paid_rate: "First payments (paid_conversions) / active users in the period.",
  pricing_to_checkout_rate: "Checkout starters / pricing visitors in the period.",
  checkout_to_paid_rate: "First payments / checkout starters in the period.",
  average_pql_score: "Mean current PQL score of unpaid users active in the period.",
  arppu: "Revenue / distinct users charged successfully in the period.",
  trend_change_pct: "(current - previous) / previous * 100 against the equally long preceding period. Null when previous is 0 or the metric is a snapshot.",
} as const;

export type MetricKey = keyof typeof METRIC_DEFINITIONS;

export function definitionsFor(keys: MetricKey[]): Partial<Record<MetricKey, string>> {
  return Object.fromEntries(keys.map((k) => [k, METRIC_DEFINITIONS[k]]));
}

export function trend(current: number, previous: number | null) {
  return {
    value: current,
    previous,
    change_pct:
      previous === null || previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10,
  };
}

export function pct(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10;
}
