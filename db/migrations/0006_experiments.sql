-- ---------------------------------------------------------------------------
-- Free-plan experiments (Dashboard 4, SOP section 11 "experiment exposure").
--
-- Assignment is a fact reported by the product, never inferred here: betterapply
-- sends a server-side `experiment_assigned` event carrying {experiment_id,
-- variant} at the moment it buckets a user. The rollup folds those events into
-- experiment_assignments, first assignment wins, so a re-bucketed user is never
-- counted twice and reruns are idempotent.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS experiments (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  hypothesis  text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'archived')),
  metric      text NOT NULL DEFAULT 'paid',
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiment_variants (
  experiment_id text NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant       text NOT NULL,
  label         text,
  is_control    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, variant)
);

-- At most one control per experiment: lift is meaningless against two baselines.
CREATE UNIQUE INDEX IF NOT EXISTS experiment_variants_one_control
  ON experiment_variants (experiment_id) WHERE is_control;

CREATE TABLE IF NOT EXISTS experiment_assignments (
  experiment_id text NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  user_id       text NOT NULL,
  variant       text NOT NULL,
  assigned_at   timestamptz NOT NULL,
  event_id      text,
  PRIMARY KEY (experiment_id, user_id)
);

CREATE INDEX IF NOT EXISTS experiment_assignments_variant_idx ON experiment_assignments (experiment_id, variant);
CREATE INDEX IF NOT EXISTS experiment_assignments_user_idx    ON experiment_assignments (user_id);
