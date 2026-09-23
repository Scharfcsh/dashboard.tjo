-- ---------------------------------------------------------------------------
-- Shared SQL definitions + the user facts view + built-in alert rules.
--
-- The functions below are the ONLY definitions of "paid" and "online" in SQL.
-- TypeScript metric helpers (lib/metrics) and jobs call them rather than
-- restating the predicate.
-- ---------------------------------------------------------------------------

-- Online = seen within ONLINE_WINDOW_SECONDS (set per connection by lib/db/pool.ts).
CREATE OR REPLACE FUNCTION online_cutoff() RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT now() - make_interval(secs => COALESCE(NULLIF(current_setting('app.online_window_seconds', true), ''), '300')::int)
$$;

-- Paid = a subscription with access right now. `pending` is Razorpay still
-- retrying a charge (access kept); `halted`/`cancelled`/`completed`/`expired` are not paid.
CREATE OR REPLACE FUNCTION is_paid_user(p_user_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'authenticated', 'pending')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  )
$$;

-- Business date -> UTC instant bounds.
CREATE OR REPLACE FUNCTION business_day_start(d date) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT (d::timestamp AT TIME ZONE business_tz())
$$;

-- One row per identified user with every attribute a cohort, rule or list can
-- filter on. Reads derived tables only. lib/segments/conditions.ts whitelists
-- these columns - add a column there too when adding one here.
CREATE VIEW v_user_facts AS
SELECT
  u.user_id,
  u.email,
  u.name,
  u.phone,
  u.country,
  u.city,
  u.plan,
  u.acq_source,
  u.acq_medium,
  u.acq_campaign,
  u.how_heard,
  u.signup_at,
  u.first_seen_at,
  u.last_active_at,
  CASE WHEN u.last_active_at IS NULL THEN NULL
       ELSE floor(extract(epoch FROM now() - u.last_active_at) / 86400)::int END             AS days_since_active,
  CASE WHEN u.signup_at IS NULL THEN NULL
       ELSE business_today() - business_date(u.signup_at) END                                 AS days_since_signup,
  p.target_role,
  p.experience,
  p.profile_completion,
  COALESCE(ls.stage, 'new')                                                                   AS lifecycle_stage,
  ls.entered_at                                                                               AS lifecycle_entered_at,
  COALESCE(ps.score, 0)                                                                       AS pql_score,
  COALESCE(ps.category, 'early')                                                              AS pql_category,
  ps.priority,
  ps.priority_trigger,
  ps.next_best_action,
  is_paid_user(u.user_id)                                                                     AS is_paid,
  COALESCE(aau.used, 0)                                                                       AS auto_apply_used,
  COALESCE(aau.success_total, 0)                                                              AS auto_apply_success_total,
  COALESCE(aau.failed_total, 0)                                                               AS auto_apply_failed_total,
  COALESCE(m.active_days_7d, 0)                                                               AS active_days_7d,
  COALESCE(m.active_days_30d, 0)                                                              AS active_days_30d,
  COALESCE(m.sessions_7d, 0)                                                                  AS sessions_7d,
  COALESCE(m.pricing_views_7d, 0)                                                             AS pricing_views_7d,
  COALESCE(m.pricing_views_30d, 0)                                                            AS pricing_views_30d,
  COALESCE(m.plan_clicks_30d, 0)                                                              AS plan_clicks_30d,
  COALESCE(m.checkout_started_30d, 0)                                                         AS checkout_started_30d,
  COALESCE(m.payments_failed_30d, 0)                                                          AS payments_failed_30d,
  COALESCE(m.auto_apply_started_7d, 0)                                                        AS auto_apply_started_7d,
  COALESCE(m.auto_apply_failed_7d, 0)                                                         AS auto_apply_failed_7d,
  pr.last_seen_at,
  COALESCE(pr.last_seen_at > online_cutoff(), false)                                          AS is_online,
  (lead.id IS NOT NULL)                                                                       AS has_open_lead,
  lead.id                                                                                     AS open_lead_id,
  lead.owner_id                                                                               AS lead_owner_id,
  lead.status                                                                                 AS lead_status
FROM users u
LEFT JOIN user_profiles p     ON p.user_id = u.user_id
LEFT JOIN lifecycle_state ls  ON ls.user_id = u.user_id
LEFT JOIN pql_scores ps       ON ps.user_id = u.user_id
LEFT JOIN auto_apply_usage aau ON aau.user_id = u.user_id
LEFT JOIN user_presence pr    ON pr.user_id = u.user_id
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE d.is_active AND d.business_date > business_today() - 7)     AS active_days_7d,
    count(*) FILTER (WHERE d.is_active)                                                AS active_days_30d,
    sum(d.sessions_count) FILTER (WHERE d.business_date > business_today() - 7)        AS sessions_7d,
    sum(d.pricing_views) FILTER (WHERE d.business_date > business_today() - 7)         AS pricing_views_7d,
    sum(d.pricing_views)                                                               AS pricing_views_30d,
    sum(d.plan_clicks)                                                                 AS plan_clicks_30d,
    sum(d.checkout_started)                                                            AS checkout_started_30d,
    sum(d.payments_failed)                                                             AS payments_failed_30d,
    sum(d.auto_apply_started) FILTER (WHERE d.business_date > business_today() - 7)    AS auto_apply_started_7d,
    sum(d.auto_apply_failed) FILTER (WHERE d.business_date > business_today() - 7)     AS auto_apply_failed_7d
  FROM user_daily_metrics d
  WHERE d.user_id = u.user_id AND d.business_date > business_today() - 30
) m ON true
LEFT JOIN LATERAL (
  SELECT l.id, l.owner_id, l.status
  FROM sales_leads l
  WHERE l.user_id = u.user_id AND l.status IN ('new', 'contacted', 'interested', 'callback')
  LIMIT 1
) lead ON true;

-- ---------------------------------------------------------------------------
-- Built-in rules for SOP 5.3 priority overrides. They key off
-- pql_scores.priority_trigger, which lib/scoring/priority.ts computes, so the
-- routing reason and the alert can never disagree.
-- ---------------------------------------------------------------------------
INSERT INTO alert_rules (id, name, description, category, status, is_builtin, conditions, actions, priority, owner_team, sla_minutes, cooldown_hours, created_by, activated_at)
VALUES
  ('payment_failed', 'Payment failed', 'A subscription charge failed and has not recovered.', 'revenue', 'active', true,
   '{"op":"and","conditions":[{"field":"priority_trigger","cmp":"eq","value":"payment_failed"}]}',
   '[{"type":"create_alert"},{"type":"create_lead"}]', 'P0', 'revenue', 15, 24, 'system', now()),
  ('checkout_abandoned', 'Checkout abandoned', 'Checkout started with no payment inside the abandonment window.', 'revenue', 'active', true,
   '{"op":"and","conditions":[{"field":"priority_trigger","cmp":"eq","value":"checkout_abandoned"}]}',
   '[{"type":"create_alert"},{"type":"create_lead"}]', 'P0', 'sales', 60, 24, 'system', now()),
  ('quota_exhausted', '50/50 exhausted and unpaid', 'Free Auto Apply allowance fully used without upgrading.', 'usage', 'active', true,
   '{"op":"and","conditions":[{"field":"priority_trigger","cmp":"eq","value":"quota_exhausted"}]}',
   '[{"type":"create_alert"},{"type":"create_lead"}]', 'P0', 'sales', 15, 72, 'system', now()),
  ('pricing_high_usage', 'Pricing + 40+ usage', 'Viewed pricing with 40 or more free applies used.', 'usage', 'active', true,
   '{"op":"and","conditions":[{"field":"priority_trigger","cmp":"eq","value":"pricing_high_usage"}]}',
   '[{"type":"create_alert"},{"type":"create_lead"}]', 'P1', 'sales', 120, 72, 'system', now()),
  ('near_limit', '45+ free applies used', 'Close to the free Auto Apply limit.', 'usage', 'active', true,
   '{"op":"and","conditions":[{"field":"priority_trigger","cmp":"eq","value":"near_limit"}]}',
   '[{"type":"create_alert"},{"type":"create_lead"}]', 'P1', 'sales', 480, 72, 'system', now()),
  ('repeated_failure', 'Repeated Auto Apply failure', 'Several Auto Apply failures in the last 7 days - support before sales.', 'support', 'active', true,
   '{"op":"and","conditions":[{"field":"priority_trigger","cmp":"eq","value":"repeated_failure"}]}',
   '[{"type":"create_alert"}]', 'P1', 'support', 480, 72, 'system', now()),
  ('dormant_power_user_returned', 'Dormant power user returns', 'A former power user came back after a dormant period.', 'retention', 'active', true,
   '{"op":"and","conditions":[{"field":"priority_trigger","cmp":"eq","value":"dormant_power_user_returned"}]}',
   '[{"type":"create_alert"},{"type":"create_lead"}]', 'P1', 'growth', 1440, 168, 'system', now()),
  ('new_activated', 'New activated user', 'Recently activated - nurture, do not hard-sell.', 'product', 'active', true,
   '{"op":"and","conditions":[{"field":"priority_trigger","cmp":"eq","value":"new_activated"}]}',
   '[{"type":"create_alert"}]', 'P2', 'growth', 4320, 720, 'system', now());
