-- ---------------------------------------------------------------------------
-- TopJobOffer analytics - core schema.
--
-- Conventions
--   * Every instant is timestamptz (stored UTC). Business dates are `date`
--     columns computed in the business timezone - see business_today() below and
--     lib/time/business-time.ts. Never compute a business date any other way.
--   * Raw tables (user_events, request_logs) are append-only and idempotent on
--     their natural id. Everything else is derived by lib/jobs and can be rebuilt
--     from the raw tables.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The business timezone is set per connection by lib/db/pool.ts
-- (SET app.business_timezone). Falls back to UTC so ad-hoc psql sessions work.
CREATE OR REPLACE FUNCTION business_tz() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.business_timezone', true), ''), 'UTC')
$$;

CREATE OR REPLACE FUNCTION business_date(ts timestamptz) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT (ts AT TIME ZONE business_tz())::date
$$;

CREATE OR REPLACE FUNCTION business_today() RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT business_date(now())
$$;

-- ===========================================================================
-- Raw ingestion
-- ===========================================================================

CREATE TABLE user_events (
  event_id       text PRIMARY KEY,
  event_name     text        NOT NULL,
  user_id        text,
  anonymous_id   text,
  session_id     text,
  occurred_at    timestamptz NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  page           text,
  properties     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  trusted        boolean     NOT NULL,
  ingest_source  text        NOT NULL CHECK (ingest_source IN ('server', 'client', 'derived')),
  country        text,
  user_agent     text
);
CREATE INDEX user_events_user_time_idx    ON user_events (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX user_events_anon_time_idx    ON user_events (anonymous_id, occurred_at DESC) WHERE anonymous_id IS NOT NULL;
CREATE INDEX user_events_name_time_idx    ON user_events (event_name, occurred_at);
CREATE INDEX user_events_session_idx      ON user_events (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX user_events_occurred_idx     ON user_events (occurred_at DESC, event_id DESC);
CREATE INDEX user_events_received_brin    ON user_events USING brin (received_at);

CREATE TABLE request_logs (
  request_id        text PRIMARY KEY,
  method            text        NOT NULL,
  path              text        NOT NULL,
  status_code       integer     NOT NULL,
  response_time_ms  double precision,
  user_id           text,
  ip_address        inet,
  user_agent        text,
  occurred_at       timestamptz NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  extra             jsonb       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX request_logs_occurred_idx ON request_logs (occurred_at DESC, request_id DESC);
CREATE INDEX request_logs_path_idx     ON request_logs (path, occurred_at DESC);
CREATE INDEX request_logs_status_idx   ON request_logs (status_code, occurred_at DESC);
CREATE INDEX request_logs_user_idx     ON request_logs (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;

-- ===========================================================================
-- Identity
-- ===========================================================================

CREATE TABLE users (
  user_id           text PRIMARY KEY,
  email             text,
  name              text,
  phone             text,
  country           text,
  city              text,
  plan              text        NOT NULL DEFAULT 'FREE',
  signup_at         timestamptz,
  first_seen_at     timestamptz,
  last_seen_at      timestamptz,
  -- Last *meaningful* event (see lib/events/catalog.ts). Dormancy keys off this.
  last_active_at    timestamptz,
  acq_source        text,
  acq_medium        text,
  acq_campaign      text,
  acq_referrer      text,
  acq_landing_page  text,
  how_heard         text,
  traits            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_signup_idx   ON users (signup_at);
CREATE INDEX users_country_idx  ON users (country);
CREATE INDEX users_source_idx   ON users (acq_source);
CREATE INDEX users_updated_idx  ON users (updated_at);
CREATE INDEX users_email_idx    ON users (lower(email));

CREATE TABLE user_profiles (
  user_id             text PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
  target_role         text,
  experience          text,
  preferences         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  profile_completion  integer,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- First identified user wins for a browser; a shared browser is a known limit.
CREATE TABLE identity_links (
  anonymous_id  text PRIMARY KEY,
  user_id       text        NOT NULL,
  linked_at     timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_links_user_idx    ON identity_links (user_id);
CREATE INDEX identity_links_created_idx ON identity_links (created_at);

-- Events with their resolved identity: the Clerk id if present, else whoever
-- that browser later identified as.
CREATE VIEW v_resolved_events AS
SELECT e.*, COALESCE(e.user_id, il.user_id) AS resolved_user_id
FROM user_events e
LEFT JOIN identity_links il ON e.user_id IS NULL AND il.anonymous_id = e.anonymous_id;

-- ===========================================================================
-- Sessions & presence
-- ===========================================================================

CREATE TABLE user_sessions (
  session_id             text PRIMARY KEY,
  user_id                text,
  anonymous_id           text,
  started_at             timestamptz NOT NULL,
  last_activity_at       timestamptz NOT NULL,
  -- NULL while the session could still receive events (idle < SESSION_IDLE_MINUTES).
  ended_at               timestamptz,
  duration_seconds       integer     NOT NULL DEFAULT 0,
  device_type            text,
  browser                text,
  os                     text,
  country                text,
  landing_page           text,
  exit_page              text,
  acquisition            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  event_count            integer     NOT NULL DEFAULT 0,
  important_event_count  integer     NOT NULL DEFAULT 0,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_idx      ON user_sessions (user_id, started_at DESC);
CREATE INDEX user_sessions_activity_idx  ON user_sessions (user_id, last_activity_at DESC);
CREATE INDEX user_sessions_started_idx   ON user_sessions (started_at);

-- Heartbeat cache written at ingest time. "Online" is read from here only.
CREATE TABLE user_presence (
  user_id             text PRIMARY KEY,
  last_seen_at        timestamptz NOT NULL,
  current_session_id  text,
  current_page        text,
  last_event_name     text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_presence_seen_idx ON user_presence (last_seen_at DESC);

-- ===========================================================================
-- Aggregates
-- ===========================================================================

CREATE TABLE user_daily_metrics (
  user_id              text    NOT NULL,
  business_date        date    NOT NULL,
  is_active            boolean NOT NULL DEFAULT false,
  first_event_at       timestamptz,
  last_event_at        timestamptz,
  events_count         integer NOT NULL DEFAULT 0,
  meaningful_events    integer NOT NULL DEFAULT 0,
  sessions_count       integer NOT NULL DEFAULT 0,
  logins               integer NOT NULL DEFAULT 0,
  searches             integer NOT NULL DEFAULT 0,
  jobs_viewed          integer NOT NULL DEFAULT 0,
  jobs_saved           integer NOT NULL DEFAULT 0,
  apply_clicks         integer NOT NULL DEFAULT 0,
  resume_uploads       integer NOT NULL DEFAULT 0,
  pricing_views        integer NOT NULL DEFAULT 0,
  plan_compares        integer NOT NULL DEFAULT 0,
  plan_clicks          integer NOT NULL DEFAULT 0,
  checkout_started     integer NOT NULL DEFAULT 0,
  checkout_abandoned   integer NOT NULL DEFAULT 0,
  payments_success     integer NOT NULL DEFAULT 0,
  payments_failed      integer NOT NULL DEFAULT 0,
  revenue_amount       numeric(14, 2) NOT NULL DEFAULT 0,
  auto_apply_started   integer NOT NULL DEFAULT 0,
  auto_apply_success   integer NOT NULL DEFAULT 0,
  auto_apply_failed    integer NOT NULL DEFAULT 0,
  features             text[]  NOT NULL DEFAULT '{}',
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, business_date)
);
CREATE INDEX user_daily_metrics_date_idx    ON user_daily_metrics (business_date) WHERE is_active;
CREATE INDEX user_daily_metrics_updated_idx ON user_daily_metrics (updated_at);

-- First time each user reached a milestone. Sticky: never moves later.
CREATE TABLE user_milestones (
  user_id    text        NOT NULL,
  milestone  text        NOT NULL,
  first_at   timestamptz NOT NULL,
  event_id   text,
  PRIMARY KEY (user_id, milestone)
);
CREATE INDEX user_milestones_milestone_idx ON user_milestones (milestone, first_at);

CREATE TABLE auto_apply_usage (
  user_id         text PRIMARY KEY,
  used            integer     NOT NULL DEFAULT 0,
  usage_limit     integer     NOT NULL DEFAULT 50,
  started_total   integer     NOT NULL DEFAULT 0,
  success_total   integer     NOT NULL DEFAULT 0,
  failed_total    integer     NOT NULL DEFAULT 0,
  -- 'reported' = `used` came from the main app; 'derived' = success count fallback.
  used_basis      text        NOT NULL DEFAULT 'derived',
  last_sample_at  timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auto_apply_usage_used_idx ON auto_apply_usage (used);

-- ===========================================================================
-- Subscriptions & payments
-- ===========================================================================

CREATE TABLE subscriptions (
  subscription_id     text PRIMARY KEY,
  user_id             text        NOT NULL,
  plan                text,
  cycle               text,
  status              text        NOT NULL,
  amount              numeric(14, 2),
  currency            text,
  checkout_started_at timestamptz,
  started_at          timestamptz,
  current_period_end  timestamptz,
  cancelled_at        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_idx    ON subscriptions (user_id);
CREATE INDEX subscriptions_updated_idx ON subscriptions (updated_at);

CREATE TABLE subscription_events (
  event_id         text PRIMARY KEY,
  subscription_id  text,
  user_id          text        NOT NULL,
  event_name       text        NOT NULL,
  status           text,
  plan             text,
  occurred_at      timestamptz NOT NULL
);
CREATE INDEX subscription_events_user_idx ON subscription_events (user_id, occurred_at DESC);

-- Webhook retries arrive as new event_ids, so dedupe on the provider-level key.
CREATE TABLE payment_events (
  idempotency_key  text PRIMARY KEY,
  event_id         text        NOT NULL,
  user_id          text        NOT NULL,
  subscription_id  text,
  status           text        NOT NULL CHECK (status IN ('success', 'failed')),
  amount           numeric(14, 2),
  currency         text,
  provider_event   text,
  reason           text,
  occurred_at      timestamptz NOT NULL
);
CREATE INDEX payment_events_user_idx ON payment_events (user_id, occurred_at DESC);
CREATE INDEX payment_events_time_idx ON payment_events (occurred_at);

-- ===========================================================================
-- Derived state: lifecycle & PQL
-- ===========================================================================

CREATE TABLE lifecycle_state (
  user_id         text PRIMARY KEY,
  stage           text        NOT NULL,
  previous_stage  text,
  entered_at      timestamptz NOT NULL,
  reason          text,
  rules_version   text        NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lifecycle_state_stage_idx ON lifecycle_state (stage);

CREATE TABLE lifecycle_history (
  id              bigserial PRIMARY KEY,
  user_id         text        NOT NULL,
  from_stage      text,
  to_stage        text        NOT NULL,
  transitioned_at timestamptz NOT NULL,
  reason          text,
  rules_version   text        NOT NULL
);
CREATE INDEX lifecycle_history_time_idx ON lifecycle_history (transitioned_at);
CREATE INDEX lifecycle_history_user_idx ON lifecycle_history (user_id, transitioned_at DESC);

CREATE TABLE pql_scores (
  user_id           text PRIMARY KEY,
  score             integer     NOT NULL,
  category          text        NOT NULL,
  priority          text CHECK (priority IN ('P0', 'P1', 'P2')),
  priority_trigger  text,
  priority_reason   text,
  owner_team        text,
  next_best_action  text        NOT NULL,
  reasons           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  facts             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_paid           boolean     NOT NULL DEFAULT false,
  rules_version     text        NOT NULL,
  computed_at       timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pql_scores_score_idx    ON pql_scores (score DESC);
CREATE INDEX pql_scores_priority_idx ON pql_scores (priority, score DESC) WHERE priority IS NOT NULL;
CREATE INDEX pql_scores_category_idx ON pql_scores (category);
CREATE INDEX pql_scores_updated_idx  ON pql_scores (updated_at);

CREATE TABLE pql_score_history (
  id                bigserial PRIMARY KEY,
  user_id           text        NOT NULL,
  score             integer     NOT NULL,
  previous_score    integer,
  category          text        NOT NULL,
  priority          text,
  priority_trigger  text,
  reasons           jsonb       NOT NULL,
  rules_version     text        NOT NULL,
  trigger_event_id  text,
  computed_at       timestamptz NOT NULL
);
CREATE INDEX pql_score_history_user_idx ON pql_score_history (user_id, computed_at DESC, id DESC);

-- ===========================================================================
-- Sales
-- ===========================================================================

CREATE TABLE team_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  email       text        UNIQUE,
  role        text        NOT NULL CHECK (role IN ('caller', 'sales_manager', 'support', 'founder', 'admin', 'growth', 'product')),
  team        text        NOT NULL DEFAULT 'sales',
  active      boolean     NOT NULL DEFAULT true,
  capacity    integer     NOT NULL DEFAULT 50,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales_leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL,
  status             text        NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'contacted', 'interested', 'callback', 'converted', 'lost')),
  priority           text        NOT NULL CHECK (priority IN ('P0', 'P1', 'P2')),
  reason             text        NOT NULL,
  reason_code        text,
  source             text        NOT NULL CHECK (source IN ('rule', 'manual')),
  rule_id            text,
  owner_id           uuid REFERENCES team_members (id),
  attempts           integer     NOT NULL DEFAULT 0,
  last_contacted_at  timestamptz,
  last_disposition   text,
  next_action        text,
  next_action_at     timestamptz,
  sla_due_at         timestamptz,
  suppressed_until   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  closed_at          timestamptz
);
-- One open lead per user (SOP 6.2).
CREATE UNIQUE INDEX sales_leads_one_open_per_user ON sales_leads (user_id)
  WHERE status IN ('new', 'contacted', 'interested', 'callback');
CREATE INDEX sales_leads_owner_idx   ON sales_leads (owner_id, status, priority);
CREATE INDEX sales_leads_status_idx  ON sales_leads (status, priority, next_action_at);
CREATE INDEX sales_leads_user_idx    ON sales_leads (user_id, created_at DESC);
CREATE INDEX sales_leads_created_idx ON sales_leads (created_at);

CREATE TABLE sales_assignments (
  id             bigserial PRIMARY KEY,
  lead_id        uuid        NOT NULL REFERENCES sales_leads (id),
  user_id        text        NOT NULL,
  from_owner_id  uuid REFERENCES team_members (id),
  to_owner_id    uuid REFERENCES team_members (id),
  assigned_by    text,
  reason         text,
  assigned_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_assignments_lead_idx ON sales_assignments (lead_id, assigned_at DESC);
CREATE INDEX sales_assignments_time_idx ON sales_assignments (assigned_at);

CREATE TABLE sales_activities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid REFERENCES sales_leads (id),
  user_id           text        NOT NULL,
  actor_id          text        NOT NULL,
  type              text        NOT NULL CHECK (type IN ('call', 'whatsapp', 'email', 'note', 'disposition')),
  outcome           text,
  disposition       text,
  body              text,
  duration_seconds  integer,
  metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_activities_user_idx  ON sales_activities (user_id, occurred_at DESC, id);
CREATE INDEX sales_activities_lead_idx  ON sales_activities (lead_id, occurred_at DESC);
CREATE INDEX sales_activities_actor_idx ON sales_activities (actor_id, occurred_at DESC);

CREATE TABLE callbacks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid        NOT NULL REFERENCES sales_leads (id),
  user_id       text        NOT NULL,
  owner_id      uuid REFERENCES team_members (id),
  due_at        timestamptz NOT NULL,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  notes         text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
CREATE INDEX callbacks_owner_due_idx ON callbacks (owner_id, status, due_at);
CREATE INDEX callbacks_lead_idx      ON callbacks (lead_id);

-- ===========================================================================
-- Alerts & automation
-- ===========================================================================

CREATE TABLE alert_rules (
  id              text PRIMARY KEY,
  name            text        NOT NULL,
  description     text,
  category        text        NOT NULL CHECK (category IN ('revenue', 'usage', 'retention', 'sales', 'product', 'support')),
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  is_builtin      boolean     NOT NULL DEFAULT false,
  conditions      jsonb       NOT NULL,
  actions         jsonb       NOT NULL,
  priority        text        NOT NULL CHECK (priority IN ('P0', 'P1', 'P2')),
  owner_team      text        NOT NULL,
  sla_minutes     integer     NOT NULL,
  cooldown_hours  integer     NOT NULL DEFAULT 24,
  version         integer     NOT NULL DEFAULT 1,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz
);

CREATE TABLE alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id          text        NOT NULL REFERENCES alert_rules (id),
  rule_version     integer     NOT NULL,
  user_id          text,
  priority         text        NOT NULL,
  category         text        NOT NULL,
  owner_team       text        NOT NULL,
  owner_id         uuid REFERENCES team_members (id),
  title            text        NOT NULL,
  reason           text,
  status           text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  idempotency_key  text        NOT NULL UNIQUE,
  sla_due_at       timestamptz,
  context          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolved_by      text,
  resolution       text
);
CREATE INDEX alerts_status_idx   ON alerts (status, priority, created_at DESC);
CREATE INDEX alerts_team_idx     ON alerts (owner_team, status);
CREATE INDEX alerts_sla_idx      ON alerts (sla_due_at) WHERE status <> 'resolved';
CREATE INDEX alerts_user_idx     ON alerts (user_id, created_at DESC);
CREATE INDEX alerts_rule_idx     ON alerts (rule_id, user_id, created_at DESC);

CREATE TABLE automation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         text        NOT NULL REFERENCES alert_rules (id),
  rule_version    integer     NOT NULL,
  mode            text        NOT NULL CHECK (mode IN ('live', 'test')),
  status          text        NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'skipped')),
  matched_count   integer     NOT NULL DEFAULT 0,
  actions_result  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error           text,
  triggered_by    text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
CREATE INDEX automation_runs_rule_idx ON automation_runs (rule_id, started_at DESC);

-- ===========================================================================
-- Cohorts, audit, jobs
-- ===========================================================================

CREATE TABLE saved_cohorts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  description      text,
  current_version  integer     NOT NULL DEFAULT 1,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saved_cohort_versions (
  cohort_id    uuid        NOT NULL REFERENCES saved_cohorts (id) ON DELETE CASCADE,
  version      integer     NOT NULL,
  definition   jsonb       NOT NULL,
  -- Count at save time, from the same compiler as /api/cohorts/preview.
  user_count   integer,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cohort_id, version)
);

CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  actor_id     text,
  action       text        NOT NULL,
  entity_type  text        NOT NULL,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE TABLE job_state (
  job_name    text PRIMARY KEY,
  watermark   timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_runs (
  id           bigserial PRIMARY KEY,
  job_name     text        NOT NULL,
  status       text        NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  trigger      text        NOT NULL,
  stats        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX job_runs_name_idx ON job_runs (job_name, started_at DESC);
