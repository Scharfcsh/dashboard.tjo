import { getPool } from "@/lib/db/pool";
import {
  AUTO_APPLY_THRESHOLDS,
  EVENT_CATALOG,
  FREE_AUTO_APPLY_LIMIT,
  NOT_MEANINGFUL_EVENTS,
} from "@/lib/events/catalog";
import { resolvedEventsFor } from "@/lib/jobs/sql";

// ---------------------------------------------------------------------------
// Daily rollup, milestones and Auto Apply usage.
//
// user_daily_metrics   one row per (user, business date); full recompute of each
//                      dirty pair from raw events, so reruns converge.
// user_milestones      first time a user reached each milestone (sticky).
// auto_apply_usage     current free-allowance consumption.
// ---------------------------------------------------------------------------

/** Checkout counts as abandoned after this long without payment. */
export const CHECKOUT_ABANDON_MINUTES = 30;

const featureMap = () => {
  const entries = Object.entries(EVENT_CATALOG).filter(([, d]) => d.feature);
  return { names: entries.map(([n]) => n), features: entries.map(([, d]) => d.feature!) };
};

/**
 * checkout_abandoned is not emitted by anyone - it is the absence of a payment.
 * Written back as a derived event with a deterministic id (idempotent), so it
 * shows up in timelines, daily metrics and scoring like any other event.
 * betterapply sends checkout_started from both browser and server; a browser
 * copy is only used when no server copy exists around the same moment.
 */
export async function deriveCheckoutAbandoned(): Promise<number> {
  const { rowCount } = await getPool().query(
    `INSERT INTO user_events (event_id, event_name, user_id, anonymous_id, session_id, occurred_at, page,
                              properties, trusted, ingest_source)
     SELECT 'derived:checkout_abandoned:' || c.event_id, 'checkout_abandoned', c.user_id, c.anonymous_id,
            c.session_id, c.occurred_at + make_interval(mins => $1), c.page,
            jsonb_strip_nulls(jsonb_build_object(
              'checkout_event_id', c.event_id, 'plan', c.properties->'plan', 'cycle', c.properties->'cycle',
              'subscription_id', c.properties->'subscription_id', 'window_minutes', $1)),
            true, 'derived'
     FROM user_events c
     WHERE c.event_name = 'checkout_started'
       AND c.user_id IS NOT NULL
       AND c.occurred_at > now() - interval '7 days'
       AND c.occurred_at <= now() - make_interval(mins => $1)
       AND (c.trusted OR NOT EXISTS (
             SELECT 1 FROM user_events s
             WHERE s.event_name = 'checkout_started' AND s.trusted AND s.user_id = c.user_id
               AND s.occurred_at BETWEEN c.occurred_at - interval '10 minutes' AND c.occurred_at + interval '10 minutes'))
       AND NOT EXISTS (
             SELECT 1 FROM user_events p
             WHERE p.user_id = c.user_id AND p.event_name IN ('payment_success', 'subscription_started')
               AND p.occurred_at >= c.occurred_at - interval '1 minute')
     ON CONFLICT (event_id) DO NOTHING`,
    [CHECKOUT_ABANDON_MINUTES]
  );
  return rowCount ?? 0;
}

export async function rollupDailyMetrics(pairs: { userId: string; date: string }[]): Promise<number> {
  if (pairs.length === 0) return 0;
  const unique = [...new Map(pairs.map((p) => [`${p.userId}|${p.date}`, p])).values()];
  const { names, features } = featureMap();

  const { rowCount } = await getPool().query(
    `WITH keys AS (
       SELECT user_id, d, business_day_start(d) AS lo, business_day_start(d + 1) AS hi
       FROM unnest($1::text[], $2::date[]) AS k(user_id, d)
     ),
     ev AS (
       SELECT k.user_id, k.d, e.event_name, e.session_id, e.occurred_at, e.trusted, e.ingest_source
       FROM keys k JOIN user_events e ON e.user_id = k.user_id AND e.occurred_at >= k.lo AND e.occurred_at < k.hi
       UNION ALL
       SELECT k.user_id, k.d, e.event_name, e.session_id, e.occurred_at, e.trusted, e.ingest_source
       FROM keys k
       JOIN identity_links il ON il.user_id = k.user_id
       JOIN user_events e ON e.anonymous_id = il.anonymous_id AND e.user_id IS NULL
                         AND e.occurred_at >= k.lo AND e.occurred_at < k.hi
     ),
     fmap AS (SELECT * FROM unnest($4::text[], $5::text[]) AS f(event_name, feature)),
     agg AS (
       SELECT ev.user_id, ev.d,
         count(*)                                                                          AS events_count,
         count(*) FILTER (WHERE ev.ingest_source <> 'derived' AND NOT (ev.event_name = ANY($3::text[]))) AS meaningful,
         min(ev.occurred_at)                                                               AS first_event_at,
         max(ev.occurred_at)                                                               AS last_event_at,
         count(DISTINCT ev.session_id)                                                     AS sessions_count,
         count(*) FILTER (WHERE ev.event_name = 'login')                                   AS logins,
         count(*) FILTER (WHERE ev.event_name = 'search_performed')                        AS searches,
         count(*) FILTER (WHERE ev.event_name = 'job_viewed')                              AS jobs_viewed,
         count(*) FILTER (WHERE ev.event_name = 'job_saved')                               AS jobs_saved,
         count(*) FILTER (WHERE ev.event_name = 'apply_clicked')                           AS apply_clicks,
         count(*) FILTER (WHERE ev.event_name = 'resume_uploaded')                         AS resume_uploads,
         count(*) FILTER (WHERE ev.event_name = 'pricing_viewed')                          AS pricing_views,
         count(*) FILTER (WHERE ev.event_name = 'plan_compared')                           AS plan_compares,
         count(*) FILTER (WHERE ev.event_name IN ('pro_clicked', 'premium_clicked'))       AS plan_clicks,
         -- Browser and server both report checkout_started: count attempts, not copies.
         GREATEST(count(*) FILTER (WHERE ev.event_name = 'checkout_started' AND ev.trusted),
                  count(*) FILTER (WHERE ev.event_name = 'checkout_started' AND NOT ev.trusted)) AS checkout_started,
         count(*) FILTER (WHERE ev.event_name = 'checkout_abandoned')                      AS checkout_abandoned,
         count(*) FILTER (WHERE ev.event_name = 'auto_apply_started')                      AS auto_apply_started,
         count(*) FILTER (WHERE ev.event_name = 'auto_apply_success')                      AS auto_apply_success,
         count(*) FILTER (WHERE ev.event_name = 'auto_apply_failed')                       AS auto_apply_failed,
         COALESCE(array_agg(DISTINCT fmap.feature) FILTER (
           WHERE fmap.feature IS NOT NULL AND ev.ingest_source <> 'derived' AND NOT (ev.event_name = ANY($3::text[]))
         ), '{}')                                                                          AS features
       FROM ev LEFT JOIN fmap ON fmap.event_name = ev.event_name
       GROUP BY ev.user_id, ev.d
     ),
     pay AS (
       SELECT k.user_id, k.d,
              count(*) FILTER (WHERE p.status = 'success')                  AS ok,
              count(*) FILTER (WHERE p.status = 'failed')                   AS failed,
              COALESCE(sum(p.amount) FILTER (WHERE p.status = 'success'), 0) AS revenue
       FROM keys k JOIN payment_events p ON p.user_id = k.user_id AND p.occurred_at >= k.lo AND p.occurred_at < k.hi
       GROUP BY k.user_id, k.d
     )
     INSERT INTO user_daily_metrics AS m (
       user_id, business_date, is_active, first_event_at, last_event_at, events_count, meaningful_events,
       sessions_count, logins, searches, jobs_viewed, jobs_saved, apply_clicks, resume_uploads, pricing_views,
       plan_compares, plan_clicks, checkout_started, checkout_abandoned, payments_success, payments_failed,
       revenue_amount, auto_apply_started, auto_apply_success, auto_apply_failed, features, updated_at)
     SELECT k.user_id, k.d, COALESCE(a.meaningful, 0) > 0, a.first_event_at, a.last_event_at,
            COALESCE(a.events_count, 0), COALESCE(a.meaningful, 0), COALESCE(a.sessions_count, 0),
            COALESCE(a.logins, 0), COALESCE(a.searches, 0), COALESCE(a.jobs_viewed, 0), COALESCE(a.jobs_saved, 0),
            COALESCE(a.apply_clicks, 0), COALESCE(a.resume_uploads, 0), COALESCE(a.pricing_views, 0),
            COALESCE(a.plan_compares, 0), COALESCE(a.plan_clicks, 0), COALESCE(a.checkout_started, 0),
            COALESCE(a.checkout_abandoned, 0), COALESCE(p.ok, 0), COALESCE(p.failed, 0), COALESCE(p.revenue, 0),
            COALESCE(a.auto_apply_started, 0), COALESCE(a.auto_apply_success, 0), COALESCE(a.auto_apply_failed, 0),
            COALESCE(a.features, '{}'), now()
     FROM keys k
     LEFT JOIN agg a ON a.user_id = k.user_id AND a.d = k.d
     LEFT JOIN pay p ON p.user_id = k.user_id AND p.d = k.d
     ON CONFLICT (user_id, business_date) DO UPDATE SET
       is_active = EXCLUDED.is_active, first_event_at = EXCLUDED.first_event_at, last_event_at = EXCLUDED.last_event_at,
       events_count = EXCLUDED.events_count, meaningful_events = EXCLUDED.meaningful_events,
       sessions_count = EXCLUDED.sessions_count, logins = EXCLUDED.logins, searches = EXCLUDED.searches,
       jobs_viewed = EXCLUDED.jobs_viewed, jobs_saved = EXCLUDED.jobs_saved, apply_clicks = EXCLUDED.apply_clicks,
       resume_uploads = EXCLUDED.resume_uploads, pricing_views = EXCLUDED.pricing_views,
       plan_compares = EXCLUDED.plan_compares, plan_clicks = EXCLUDED.plan_clicks,
       checkout_started = EXCLUDED.checkout_started, checkout_abandoned = EXCLUDED.checkout_abandoned,
       payments_success = EXCLUDED.payments_success, payments_failed = EXCLUDED.payments_failed,
       revenue_amount = EXCLUDED.revenue_amount, auto_apply_started = EXCLUDED.auto_apply_started,
       auto_apply_success = EXCLUDED.auto_apply_success, auto_apply_failed = EXCLUDED.auto_apply_failed,
       features = EXCLUDED.features, updated_at = now()`,
    [unique.map((p) => p.userId), unique.map((p) => p.date), NOT_MEANINGFUL_EVENTS, names, features]
  );
  return rowCount ?? 0;
}

/**
 * Milestones (first occurrence, sticky via LEAST):
 *   signup, onboarded*, resume_uploaded, job_interaction, first_auto_apply,
 *   first_auto_apply_success, activated (all of resume + job interaction + first
 *   successful Auto Apply), aa_<N> usage thresholds, first_pricing_view,
 *   first_plan_click, first_checkout, first_paid, feature:<name>, upgrade_prompt:<trigger>
 *
 * * betterapply fires signup_completed only after onboarding succeeds, so it
 *   counts as onboarded too.
 */
export async function rebuildMilestones(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const { names, features } = featureMap();

  const { rowCount } = await getPool().query(
    `WITH ev AS (${resolvedEventsFor(1)}),
     fmap AS (SELECT * FROM unnest($3::text[], $4::text[]) AS f(event_name, feature)),
     thresholds AS (SELECT unnest($2::int[]) AS t),
     samples AS (
       SELECT user_id, occurred_at, event_id,
              COALESCE(try_int(properties->>'used'), try_int(properties->>'milestone')) AS used
       FROM ev
       WHERE event_name LIKE 'auto\\_apply\\_%' AND trusted
         AND COALESCE(try_int(properties->>'used'), try_int(properties->>'milestone')) IS NOT NULL
     ),
     successes AS (
       SELECT user_id, occurred_at, event_id,
              row_number() OVER (PARTITION BY user_id ORDER BY occurred_at, event_id) AS n
       FROM ev WHERE event_name = 'auto_apply_success'
     ),
     cands AS (
       SELECT user_id, 'signup' AS milestone, occurred_at, event_id FROM ev WHERE event_name = 'signup_completed'
       UNION ALL
       SELECT user_id, 'signup', signup_at, NULL FROM users WHERE user_id = ANY($1::text[]) AND signup_at IS NOT NULL
       UNION ALL
       SELECT user_id, 'onboarded', occurred_at, event_id FROM ev WHERE event_name IN ('onboarding_completed', 'signup_completed')
       UNION ALL
       SELECT user_id, 'resume_uploaded', occurred_at, event_id FROM ev WHERE event_name = 'resume_uploaded'
       UNION ALL
       SELECT user_id, 'job_interaction', occurred_at, event_id FROM ev
       WHERE event_name IN ('job_viewed', 'job_saved', 'apply_clicked', 'search_performed')
       UNION ALL
       SELECT user_id, 'first_auto_apply', occurred_at, event_id FROM ev WHERE event_name = 'auto_apply_started'
       UNION ALL
       SELECT user_id, 'first_auto_apply_success', occurred_at, event_id FROM ev WHERE event_name = 'auto_apply_success'
       UNION ALL
       SELECT user_id, 'first_pricing_view', occurred_at, event_id FROM ev WHERE event_name = 'pricing_viewed'
       UNION ALL
       SELECT user_id, 'first_plan_click', occurred_at, event_id FROM ev WHERE event_name IN ('pro_clicked', 'premium_clicked')
       UNION ALL
       SELECT user_id, 'first_checkout', occurred_at, event_id FROM ev WHERE event_name = 'checkout_started'
       UNION ALL
       SELECT user_id, 'first_paid', occurred_at, event_id FROM ev
       WHERE trusted AND event_name IN ('payment_success', 'subscription_started')
       UNION ALL
       SELECT ev.user_id, 'feature:' || fmap.feature, ev.occurred_at, ev.event_id
       FROM ev JOIN fmap ON fmap.event_name = ev.event_name
       WHERE ev.ingest_source <> 'derived' AND NOT (ev.event_name = ANY($5::text[]))
       UNION ALL
       SELECT user_id, 'upgrade_prompt:' || (properties->>'trigger'), occurred_at, event_id FROM ev
       WHERE event_name = 'upgrade_prompt_shown' AND properties ? 'trigger'
       UNION ALL
       -- Reported usage: the main app's own count (authoritative).
       SELECT s.user_id, 'aa_' || th.t, s.occurred_at, s.event_id FROM samples s JOIN thresholds th ON s.used >= th.t
       UNION ALL
       -- No reported usage at all for this user: fall back to the Nth success.
       SELECT s.user_id, 'aa_' || th.t, s.occurred_at, s.event_id
       FROM successes s JOIN thresholds th ON s.n = th.t
       WHERE NOT EXISTS (SELECT 1 FROM samples x WHERE x.user_id = s.user_id)
     ),
     firsts AS (
       SELECT DISTINCT ON (user_id, milestone) user_id, milestone, occurred_at, event_id
       FROM cands WHERE occurred_at IS NOT NULL
       ORDER BY user_id, milestone, occurred_at, event_id
     ),
     activated AS (
       SELECT user_id, 'activated' AS milestone, max(occurred_at) AS occurred_at, NULL::text AS event_id
       FROM firsts WHERE milestone IN ('resume_uploaded', 'job_interaction', 'first_auto_apply_success')
       GROUP BY user_id HAVING count(*) = 3
     )
     INSERT INTO user_milestones (user_id, milestone, first_at, event_id)
     SELECT user_id, milestone, occurred_at, event_id FROM firsts
     UNION ALL
     SELECT user_id, milestone, occurred_at, event_id FROM activated
     ON CONFLICT (user_id, milestone) DO UPDATE SET
       first_at = LEAST(user_milestones.first_at, EXCLUDED.first_at),
       event_id = CASE WHEN EXCLUDED.first_at < user_milestones.first_at THEN EXCLUDED.event_id
                       ELSE user_milestones.event_id END
     WHERE EXCLUDED.first_at < user_milestones.first_at`,
    [userIds, AUTO_APPLY_THRESHOLDS, names, features, NOT_MEANINGFUL_EVENTS]
  );
  return rowCount ?? 0;
}

/**
 * Current free Auto Apply consumption. `used` = the latest count the main app
 * reported (milestone events carry it) plus successes since that report; with no
 * report at all, the success count. The main app's count can fall when a failed
 * run refunds a slot, which only a reported value reflects - hence `used_basis`.
 */
export async function rebuildAutoApplyUsage(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const { rowCount } = await getPool().query(
    `WITH target AS (SELECT unnest($1::text[]) AS user_id),
     counts AS (
       SELECT e.user_id,
              count(*) FILTER (WHERE e.event_name = 'auto_apply_started') AS started,
              count(*) FILTER (WHERE e.event_name = 'auto_apply_success') AS success,
              count(*) FILTER (WHERE e.event_name = 'auto_apply_failed')  AS failed
       FROM user_events e
       WHERE e.user_id = ANY($1::text[]) AND e.trusted AND e.event_name LIKE 'auto\\_apply\\_%'
       GROUP BY e.user_id
     ),
     sample AS (
       SELECT DISTINCT ON (e.user_id) e.user_id, try_int(e.properties->>'used') AS used, e.occurred_at, e.event_id
       FROM user_events e
       WHERE e.user_id = ANY($1::text[]) AND e.trusted AND e.event_name LIKE 'auto\\_apply\\_%'
         AND try_int(e.properties->>'used') IS NOT NULL
       ORDER BY e.user_id, e.occurred_at DESC, e.event_id DESC
     ),
     after_sample AS (
       SELECT s.user_id, count(e.event_id) AS n
       FROM sample s
       LEFT JOIN user_events e ON e.user_id = s.user_id AND e.event_name = 'auto_apply_success'
                               AND e.occurred_at > s.occurred_at AND NOT (e.properties ? 'used')
       GROUP BY s.user_id
     )
     INSERT INTO auto_apply_usage (user_id, used, usage_limit, started_total, success_total, failed_total,
                                   used_basis, last_sample_at, updated_at)
     SELECT t.user_id,
            CASE WHEN s.used IS NOT NULL THEN s.used + COALESCE(a.n, 0) ELSE COALESCE(c.success, 0) END,
            $2, COALESCE(c.started, 0), COALESCE(c.success, 0), COALESCE(c.failed, 0),
            CASE WHEN s.used IS NOT NULL THEN 'reported' ELSE 'derived' END,
            s.occurred_at, now()
     FROM target t
     JOIN counts c ON c.user_id = t.user_id
     LEFT JOIN sample s ON s.user_id = t.user_id
     LEFT JOIN after_sample a ON a.user_id = t.user_id
     ON CONFLICT (user_id) DO UPDATE SET
       used = EXCLUDED.used, started_total = EXCLUDED.started_total, success_total = EXCLUDED.success_total,
       failed_total = EXCLUDED.failed_total, used_basis = EXCLUDED.used_basis, last_sample_at = EXCLUDED.last_sample_at,
       updated_at = now()
     WHERE (auto_apply_usage.used, auto_apply_usage.started_total, auto_apply_usage.success_total,
            auto_apply_usage.failed_total) IS DISTINCT FROM
           (EXCLUDED.used, EXCLUDED.started_total, EXCLUDED.success_total, EXCLUDED.failed_total)`,
    [userIds, FREE_AUTO_APPLY_LIMIT]
  );
  return rowCount ?? 0;
}

/**
 * Experiment bucketing, from trusted `experiment_assigned` events carrying
 * { experiment_id, variant }. The first assignment a user receives wins, so a
 * re-bucketed user is never counted in two arms and reruns change nothing.
 *
 * An experiment or variant we have not seen before is created on the spot
 * (status `draft`, named after its id) rather than dropped - the results panel
 * shows it immediately and a human renames it and marks the control later.
 */
export async function rebuildExperimentAssignments(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const pool = getPool();

  // Every well-formed assignment event, used to register the experiments and
  // variants the product actually uses - so an operator can mark the control
  // before a variant has accumulated users.
  const seen = `
    SELECT DISTINCT e.properties->>'experiment_id' AS experiment_id, e.properties->>'variant' AS variant
    FROM user_events e
    WHERE e.user_id = ANY($1::text[]) AND e.trusted AND e.event_name = 'experiment_assigned'
      AND COALESCE(e.properties->>'experiment_id', '') <> ''
      AND COALESCE(e.properties->>'variant', '') <> ''`;

  // One row per user per experiment: the first bucket they were put in. Lift is
  // only meaningful when a user sits in exactly one arm for the whole test.
  const assignments = `
    SELECT DISTINCT ON (e.user_id, e.properties->>'experiment_id')
           e.properties->>'experiment_id' AS experiment_id,
           e.user_id,
           e.properties->>'variant'       AS variant,
           e.occurred_at, e.event_id
    FROM user_events e
    WHERE e.user_id = ANY($1::text[]) AND e.trusted AND e.event_name = 'experiment_assigned'
      AND COALESCE(e.properties->>'experiment_id', '') <> ''
      AND COALESCE(e.properties->>'variant', '') <> ''
    ORDER BY e.user_id, e.properties->>'experiment_id', e.occurred_at, e.event_id`;

  await pool.query(
    `INSERT INTO experiments (id, name)
     SELECT DISTINCT s.experiment_id, s.experiment_id FROM (${seen}) s
     ON CONFLICT (id) DO NOTHING`,
    [userIds]
  );
  await pool.query(
    `INSERT INTO experiment_variants (experiment_id, variant)
     SELECT s.experiment_id, s.variant FROM (${seen}) s
     ON CONFLICT (experiment_id, variant) DO NOTHING`,
    [userIds]
  );
  const { rowCount } = await pool.query(
    `INSERT INTO experiment_assignments (experiment_id, user_id, variant, assigned_at, event_id)
     SELECT a.experiment_id, a.user_id, a.variant, a.occurred_at, a.event_id FROM (${assignments}) a
     ON CONFLICT (experiment_id, user_id) DO NOTHING`,
    [userIds]
  );
  return rowCount ?? 0;
}
