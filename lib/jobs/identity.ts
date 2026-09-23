import { getPool } from "@/lib/db/pool";
import { NOT_MEANINGFUL_EVENTS } from "@/lib/events/catalog";
import { resolvedEventsFor } from "@/lib/jobs/sql";

// ---------------------------------------------------------------------------
// Identity & billing state, rebuilt per dirty user from their full event history.
//
//   subscriptions / subscription_events / payment_events   <- trusted billing events
//   users / user_profiles                                  <- user_identified traits,
//                                                             signup, first touch, activity
//
// Everything is a full recompute for the user, so reruns are idempotent.
// ---------------------------------------------------------------------------

const BILLING_EVENTS = [
  "checkout_started",
  "subscription_started",
  "subscription_renewed",
  "subscription_cancelled",
  "subscription_expired",
  "payment_success",
  "payment_failed",
];

interface BillingEventRow {
  event_id: string;
  event_name: string;
  user_id: string;
  occurred_at: Date;
  properties: Record<string, unknown>;
}

interface SubscriptionState {
  subscription_id: string;
  user_id: string;
  plan: string | null;
  cycle: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  checkout_started_at: Date | null;
  started_at: Date | null;
  current_period_end: Date | null;
  cancelled_at: Date | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const date = (v: unknown): Date | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Razorpay amounts are minor units (paise). betterapply sends `amount: 55900`
 * for Rs 559. Stored values are major units.
 */
function majorUnits(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n / 100 : null;
}

const DEFAULT_STATUS: Record<string, string> = {
  subscription_started: "active",
  subscription_renewed: "active",
  payment_success: "active",
  payment_failed: "pending",
  subscription_cancelled: "cancelled",
  subscription_expired: "expired",
};

/** Fold billing events (oldest first) into subscription state + payment facts. Pure. */
export function foldBilling(events: BillingEventRow[]) {
  const subs = new Map<string, SubscriptionState>();
  const payments: {
    idempotency_key: string;
    event_id: string;
    user_id: string;
    subscription_id: string | null;
    status: "success" | "failed";
    provider_event: string | null;
    reason: string | null;
    occurred_at: Date;
  }[] = [];
  const lifecycle: {
    event_id: string;
    subscription_id: string | null;
    user_id: string;
    event_name: string;
    status: string | null;
    plan: string | null;
    occurred_at: Date;
  }[] = [];

  for (const e of events) {
    const p = e.properties ?? {};
    const sid = str(p.subscription_id);

    if (sid) {
      const sub: SubscriptionState = subs.get(sid) ?? {
        subscription_id: sid,
        user_id: e.user_id,
        plan: null,
        cycle: null,
        status: "created",
        amount: null,
        currency: null,
        checkout_started_at: null,
        started_at: null,
        current_period_end: null,
        cancelled_at: null,
      };
      sub.plan = str(p.plan)?.toUpperCase() ?? sub.plan;
      sub.cycle = str(p.cycle)?.toUpperCase() ?? sub.cycle;
      sub.current_period_end = date(p.current_period_end) ?? sub.current_period_end;

      if (e.event_name === "checkout_started") {
        sub.checkout_started_at ??= e.occurred_at;
        sub.amount = majorUnits(p.amount) ?? sub.amount;
        sub.currency = str(p.currency) ?? sub.currency;
      } else {
        sub.status = str(p.subscription_status)?.toLowerCase() ?? DEFAULT_STATUS[e.event_name] ?? sub.status;
        if (["subscription_started", "subscription_renewed", "payment_success"].includes(e.event_name)) {
          sub.started_at ??= e.occurred_at;
        }
        if (e.event_name === "subscription_cancelled") sub.cancelled_at = e.occurred_at;
      }
      subs.set(sid, sub);
    }

    if (e.event_name.startsWith("subscription_")) {
      lifecycle.push({
        event_id: e.event_id,
        subscription_id: sid,
        user_id: e.user_id,
        event_name: e.event_name,
        status: str(p.subscription_status),
        plan: str(p.plan),
        occurred_at: e.occurred_at,
      });
    }

    if (e.event_name === "payment_success" || e.event_name === "payment_failed") {
      // A webhook retry is a new event_id with the same provider facts: dedupe on those.
      const providerEvent = str(p.razorpay_event);
      const periodKey = str(p.current_period_end) ?? e.occurred_at.toISOString();
      const idempotencyKey = `${sid ?? `user:${e.user_id}`}:${providerEvent ?? e.event_name}:${periodKey}`;
      if (payments.some((existing) => existing.idempotency_key === idempotencyKey)) continue;
      payments.push({
        idempotency_key: idempotencyKey,
        event_id: e.event_id,
        user_id: e.user_id,
        subscription_id: sid,
        status: e.event_name === "payment_success" ? "success" : "failed",
        provider_event: providerEvent,
        reason: str(p.reason) ?? str(p.subscription_status),
        occurred_at: e.occurred_at,
      });
    }
  }

  return { subscriptions: [...subs.values()], payments, lifecycle };
}

export async function rebuildBilling(userIds: string[]): Promise<{ subscriptions: number; payments: number }> {
  if (userIds.length === 0) return { subscriptions: 0, payments: 0 };
  const pool = getPool();
  const { rows } = await pool.query<BillingEventRow>(
    `SELECT event_id, event_name, user_id, occurred_at, properties
     FROM user_events
     WHERE user_id = ANY($1::text[]) AND trusted AND event_name = ANY($2::text[])
     ORDER BY occurred_at, event_id`,
    [userIds, BILLING_EVENTS]
  );
  const { subscriptions, payments, lifecycle } = foldBilling(rows);

  if (subscriptions.length > 0) {
    await pool.query(
      `INSERT INTO subscriptions (subscription_id, user_id, plan, cycle, status, amount, currency,
                                 checkout_started_at, started_at, current_period_end, cancelled_at, updated_at)
       SELECT * , now() FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[],
                            $7::text[], $8::timestamptz[], $9::timestamptz[], $10::timestamptz[], $11::timestamptz[])
       ON CONFLICT (subscription_id) DO UPDATE SET
         user_id = EXCLUDED.user_id, plan = EXCLUDED.plan, cycle = EXCLUDED.cycle, status = EXCLUDED.status,
         amount = EXCLUDED.amount, currency = EXCLUDED.currency, checkout_started_at = EXCLUDED.checkout_started_at,
         started_at = EXCLUDED.started_at, current_period_end = EXCLUDED.current_period_end,
         cancelled_at = EXCLUDED.cancelled_at, updated_at = now()
       WHERE (subscriptions.plan, subscriptions.cycle, subscriptions.status, subscriptions.amount,
              subscriptions.current_period_end, subscriptions.cancelled_at, subscriptions.started_at)
             IS DISTINCT FROM
             (EXCLUDED.plan, EXCLUDED.cycle, EXCLUDED.status, EXCLUDED.amount,
              EXCLUDED.current_period_end, EXCLUDED.cancelled_at, EXCLUDED.started_at)`,
      [
        subscriptions.map((s) => s.subscription_id),
        subscriptions.map((s) => s.user_id),
        subscriptions.map((s) => s.plan),
        subscriptions.map((s) => s.cycle),
        subscriptions.map((s) => s.status),
        subscriptions.map((s) => s.amount),
        subscriptions.map((s) => s.currency),
        subscriptions.map((s) => s.checkout_started_at),
        subscriptions.map((s) => s.started_at),
        subscriptions.map((s) => s.current_period_end),
        subscriptions.map((s) => s.cancelled_at),
      ]
    );
  }

  if (lifecycle.length > 0) {
    await pool.query(
      `INSERT INTO subscription_events (event_id, subscription_id, user_id, event_name, status, plan, occurred_at)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[])
       ON CONFLICT (event_id) DO NOTHING`,
      [
        lifecycle.map((l) => l.event_id),
        lifecycle.map((l) => l.subscription_id),
        lifecycle.map((l) => l.user_id),
        lifecycle.map((l) => l.event_name),
        lifecycle.map((l) => l.status),
        lifecycle.map((l) => l.plan),
        lifecycle.map((l) => l.occurred_at),
      ]
    );
  }

  if (payments.length > 0) {
    // Amount comes from the subscription's checkout (webhooks do not carry it).
    await pool.query(
      `INSERT INTO payment_events (idempotency_key, event_id, user_id, subscription_id, status, amount, currency,
                                  provider_event, reason, occurred_at)
       SELECT t.idempotency_key, t.event_id, t.user_id, t.subscription_id, t.status, s.amount, s.currency,
              t.provider_event, t.reason, t.occurred_at
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::timestamptz[])
            AS t(idempotency_key, event_id, user_id, subscription_id, status, provider_event, reason, occurred_at)
       LEFT JOIN subscriptions s ON s.subscription_id = t.subscription_id
       ON CONFLICT (idempotency_key) DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency`,
      [
        payments.map((p) => p.idempotency_key),
        payments.map((p) => p.event_id),
        payments.map((p) => p.user_id),
        payments.map((p) => p.subscription_id),
        payments.map((p) => p.status),
        payments.map((p) => p.provider_event),
        payments.map((p) => p.reason),
        payments.map((p) => p.occurred_at),
      ]
    );
  }

  return { subscriptions: subscriptions.length, payments: payments.length };
}

/**
 * users + user_profiles. Trait precedence: latest user_identified/user_updated
 * value wins; acquisition prefers traits (the main app knows the real first
 * touch) and falls back to the first browser event's utm_* / referrer.
 */
export async function rebuildUsers(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const pool = getPool();

  const { rowCount } = await pool.query(
    `WITH ev AS (${resolvedEventsFor(1)}),
     agg AS (
       SELECT user_id,
              min(occurred_at)                                                             AS first_seen_at,
              LEAST(max(occurred_at) FILTER (WHERE ingest_source = 'client'), now())       AS last_seen_at,
              LEAST(max(occurred_at) FILTER (WHERE ingest_source <> 'derived'
                                               AND NOT (event_name = ANY($2::text[]))), now()) AS last_active_at,
              min(occurred_at) FILTER (WHERE event_name = 'signup_completed')              AS signup_completed_at,
              (array_agg(properties->>'how_heard' ORDER BY occurred_at)
                 FILTER (WHERE event_name = 'signup_completed' AND properties ? 'how_heard'))[1] AS how_heard,
              (array_agg(country ORDER BY occurred_at DESC) FILTER (WHERE country IS NOT NULL))[1] AS latest_country
       FROM ev GROUP BY user_id
     ),
     first_touch AS (
       SELECT DISTINCT ON (user_id) user_id, page, properties
       FROM ev WHERE ingest_source = 'client'
       ORDER BY user_id, occurred_at, event_id
     ),
     traits AS (
       SELECT ev.user_id, jsonb_object_agg(kv.key, kv.value ORDER BY ev.occurred_at, ev.event_id) AS traits
       FROM ev, jsonb_each(ev.properties) kv
       WHERE ev.event_name IN ('user_identified', 'user_updated') AND kv.value <> 'null'::jsonb
       GROUP BY ev.user_id
     ),
     paid_plan AS (
       SELECT DISTINCT ON (s.user_id) s.user_id, s.plan
       FROM subscriptions s
       WHERE s.user_id = ANY($1::text[]) AND is_paid_user(s.user_id)
         AND s.status IN ('active', 'authenticated', 'pending')
       ORDER BY s.user_id, s.started_at DESC NULLS LAST
     )
     INSERT INTO users (user_id, email, name, phone, country, city, plan, signup_at, first_seen_at, last_seen_at,
                        last_active_at, acq_source, acq_medium, acq_campaign, acq_referrer, acq_landing_page,
                        how_heard, traits, updated_at)
     SELECT a.user_id,
            tr.traits->>'email',
            COALESCE(tr.traits->>'name', NULLIF(concat_ws(' ', tr.traits->>'first_name', tr.traits->>'last_name'), '')),
            tr.traits->>'phone',
            COALESCE(upper(tr.traits->>'country'), a.latest_country),
            tr.traits->>'city',
            COALESCE(pp.plan, upper(tr.traits->>'plan'), 'FREE'),
            COALESCE(try_timestamptz(tr.traits->>'signup_at'), a.signup_completed_at),
            a.first_seen_at,
            a.last_seen_at,
            a.last_active_at,
            COALESCE(tr.traits->>'utm_source', tr.traits->'acquisition'->>'source',
                     ft.properties->>'utm_source', ft.properties->'acquisition'->>'source'),
            COALESCE(tr.traits->>'utm_medium', tr.traits->'acquisition'->>'medium',
                     ft.properties->>'utm_medium', ft.properties->'acquisition'->>'medium'),
            COALESCE(tr.traits->>'utm_campaign', tr.traits->'acquisition'->>'campaign',
                     ft.properties->>'utm_campaign', ft.properties->'acquisition'->>'campaign'),
            COALESCE(tr.traits->>'referrer', ft.properties->>'referrer'),
            COALESCE(tr.traits->>'landing_page', ft.page),
            COALESCE(tr.traits->>'how_heard', a.how_heard),
            COALESCE(tr.traits, '{}'::jsonb),
            now()
     FROM agg a
     LEFT JOIN traits tr      ON tr.user_id = a.user_id
     LEFT JOIN first_touch ft ON ft.user_id = a.user_id
     LEFT JOIN paid_plan pp   ON pp.user_id = a.user_id
     ON CONFLICT (user_id) DO UPDATE SET
       email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone, country = EXCLUDED.country,
       city = EXCLUDED.city, plan = EXCLUDED.plan, signup_at = EXCLUDED.signup_at,
       first_seen_at = EXCLUDED.first_seen_at, last_seen_at = EXCLUDED.last_seen_at,
       last_active_at = EXCLUDED.last_active_at, acq_source = EXCLUDED.acq_source, acq_medium = EXCLUDED.acq_medium,
       acq_campaign = EXCLUDED.acq_campaign, acq_referrer = EXCLUDED.acq_referrer,
       acq_landing_page = EXCLUDED.acq_landing_page, how_heard = EXCLUDED.how_heard, traits = EXCLUDED.traits,
       updated_at = now()`,
    [userIds, NOT_MEANINGFUL_EVENTS]
  );

  await pool.query(
    `INSERT INTO user_profiles (user_id, target_role, experience, preferences, profile_completion, updated_at)
     SELECT u.user_id,
            u.traits->>'target_role',
            u.traits->>'experience',
            COALESCE(u.traits->'preferences', '{}'::jsonb),
            try_int(u.traits->>'profile_completion'),
            now()
     FROM users u
     WHERE u.user_id = ANY($1::text[]) AND u.traits <> '{}'::jsonb
     ON CONFLICT (user_id) DO UPDATE SET
       target_role = EXCLUDED.target_role, experience = EXCLUDED.experience,
       preferences = EXCLUDED.preferences, profile_completion = EXCLUDED.profile_completion, updated_at = now()`,
    [userIds]
  );

  return rowCount ?? 0;
}
