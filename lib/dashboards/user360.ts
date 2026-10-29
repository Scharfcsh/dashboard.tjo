import { queryOne, queryRows } from "@/lib/db/pool";
import { eventDefinition } from "@/lib/events/catalog";
import { notFound } from "@/lib/http/errors";
import { decodeCursor, keysetPage } from "@/lib/http/pagination";
import { definitionsFor } from "@/lib/metrics/definitions";
import { applyPii } from "@/lib/pii";
import { getUserDetail } from "@/lib/user-details";

// Dashboard 3 - User 360 Intelligence Profile (SOP section 10).
// Every section keys off the same canonical user_id.

export async function assertUserExists(userId: string): Promise<void> {
  const row = await queryOne("SELECT 1 FROM users WHERE user_id = $1", [userId]);
  if (!row) throw notFound("User");
}

type UserRow = Record<string, unknown> & { name: string | null; email: string | null; phone: string | null };

export async function user360(userId: string, reveal: boolean) {
  const [found, detail] = await Promise.all([
    queryOne<UserRow>(
      `SELECT u.*, p.target_role, p.experience, p.preferences, p.profile_completion,
              is_paid_user(u.user_id) AS is_paid,
              pr.last_seen_at AS presence_last_seen_at, pr.current_page, pr.last_event_name,
              COALESCE(pr.last_seen_at > online_cutoff(), false) AS is_online
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.user_id
       LEFT JOIN user_presence pr ON pr.user_id = u.user_id
       WHERE u.user_id = $1`,
      [userId]
    ),
    getUserDetail(userId),
  ]);
  if (!found) throw notFound("User");
  // Contact details live in the product database; analytics values win if set.
  const user: UserRow = {
    ...found,
    name: found.name ?? detail?.name ?? null,
    email: found.email ?? detail?.email ?? null,
    phone: found.phone ?? detail?.phone ?? null,
  };

  const [usage, autoApply, milestones, pql, lifecycle, subscriptions, payments, lead, activityCounts, callbacks, alerts] =
    await Promise.all([
      queryOne<Record<string, string | null>>(
        `SELECT count(*) FILTER (WHERE is_active)                                         AS active_days_total,
                count(*) FILTER (WHERE is_active AND business_date > business_today() - 30) AS active_days_30d,
                COALESCE(sum(sessions_count), 0)                                           AS sessions_total,
                COALESCE(sum(sessions_count) FILTER (WHERE business_date > business_today() - 30), 0) AS sessions_30d,
                COALESCE(sum(jobs_viewed), 0) AS jobs_viewed, COALESCE(sum(jobs_saved), 0) AS jobs_saved,
                COALESCE(sum(apply_clicks), 0) AS apply_clicks, COALESCE(sum(searches), 0) AS searches,
                COALESCE(sum(resume_uploads), 0) AS resume_uploads,
                COALESCE(sum(pricing_views), 0) AS pricing_views, COALESCE(sum(plan_clicks), 0) AS plan_clicks,
                COALESCE(sum(checkout_started), 0) AS checkouts_started,
                COALESCE(sum(checkout_abandoned), 0) AS checkouts_abandoned,
                max(business_date) FILTER (WHERE pricing_views > 0)::text AS last_pricing_date,
                COALESCE(sum(auto_apply_failed) FILTER (WHERE business_date > business_today() - 7), 0) AS auto_apply_failed_7d
         FROM user_daily_metrics WHERE user_id = $1`,
        [userId]
      ),
      queryOne<Record<string, unknown>>("SELECT * FROM auto_apply_usage WHERE user_id = $1", [userId]),
      queryRows<{ milestone: string; first_at: Date }>(
        "SELECT milestone, first_at FROM user_milestones WHERE user_id = $1 ORDER BY first_at",
        [userId]
      ),
      queryOne<Record<string, unknown>>("SELECT * FROM pql_scores WHERE user_id = $1", [userId]),
      queryOne<Record<string, unknown>>("SELECT * FROM lifecycle_state WHERE user_id = $1", [userId]),
      queryRows(
        `SELECT subscription_id, plan, cycle, status, amount, currency, checkout_started_at, started_at,
                current_period_end, cancelled_at
         FROM subscriptions WHERE user_id = $1 ORDER BY COALESCE(started_at, checkout_started_at) DESC NULLS LAST`,
        [userId]
      ),
      queryOne<Record<string, unknown>>(
        `SELECT count(*) FILTER (WHERE status = 'success') AS successful,
                count(*) FILTER (WHERE status = 'failed') AS failed,
                count(*) FILTER (WHERE status = 'failed' AND occurred_at > now() - interval '30 days') AS failed_30d,
                COALESCE(sum(amount) FILTER (WHERE status = 'success'), 0) AS lifetime_revenue,
                max(occurred_at) FILTER (WHERE status = 'success') AS last_success_at,
                max(occurred_at) FILTER (WHERE status = 'failed') AS last_failure_at
         FROM payment_events WHERE user_id = $1`,
        [userId]
      ),
      queryOne<Record<string, unknown>>(
        `SELECT l.id, l.status, l.priority, l.reason, l.reason_code, l.source, l.owner_id, tm.name AS owner_name,
                l.attempts, l.last_contacted_at, l.last_disposition, l.next_action, l.next_action_at, l.sla_due_at,
                (l.sla_due_at < now() AND l.last_contacted_at IS NULL) AS sla_breached, l.created_at
         FROM sales_leads l LEFT JOIN team_members tm ON tm.id = l.owner_id
         WHERE l.user_id = $1 AND l.status IN ('new', 'contacted', 'interested', 'callback')`,
        [userId]
      ),
      queryRows<{ type: string; n: string; last_at: Date }>(
        "SELECT type, count(*) AS n, max(occurred_at) AS last_at FROM sales_activities WHERE user_id = $1 GROUP BY type",
        [userId]
      ),
      queryRows(
        `SELECT id, lead_id, owner_id, due_at, status, notes FROM callbacks
         WHERE user_id = $1 AND status = 'pending' ORDER BY due_at`,
        [userId]
      ),
      queryRows(
        `SELECT id, rule_id, title, priority, owner_team, status, sla_due_at, created_at FROM alerts
         WHERE user_id = $1 AND status <> 'resolved' ORDER BY created_at DESC`,
        [userId]
      ),
    ]);

  const m = Object.fromEntries(milestones.map((x) => [x.milestone, x.first_at]));
  const num = (v: unknown) => Number(v ?? 0);
  const success = num(autoApply?.success_total);
  const failed = num(autoApply?.failed_total);
  const masked = applyPii({ email: user.email, phone: user.phone }, reveal);

  return {
    data: {
      identity: {
        user_id: userId,
        name: user.name,
        email: masked.email,
        phone: masked.phone,
        country: user.country,
        city: user.city,
        plan: user.plan,
        is_paid: user.is_paid,
        signup_at: user.signup_at,
        first_seen_at: user.first_seen_at,
        last_seen_at: user.last_seen_at,
        last_active_at: user.last_active_at,
        presence: {
          is_online: user.is_online,
          last_seen_at: user.presence_last_seen_at,
          current_page: user.current_page,
          last_event: user.last_event_name,
        },
      },
      details: detail
        ? {
            location: detail.location,
            headline: detail.headline,
            skills: detail.skills,
            username: detail.username,
            onboarded: detail.onboarded,
            last_seen_at: detail.lastSeenAt,
            billing: {
              plan: detail.plan,
              plan_status: detail.planStatus,
              billing_cycle: detail.billingCycle,
              current_period_end: detail.currentPeriodEnd,
              premium_until: detail.premiumUntil,
              pro_until: detail.proUntil,
              payment_provider: detail.paymentProvider,
            },
          }
        : null,
      profile: {
        target_role: user.target_role ?? null,
        experience: user.experience ?? null,
        preferences: user.preferences ?? {},
        profile_completion: user.profile_completion ?? null,
      },
      acquisition: {
        source: user.acq_source,
        medium: user.acq_medium,
        campaign: user.acq_campaign,
        referrer: user.acq_referrer,
        landing_page: user.acq_landing_page,
        how_heard: user.how_heard,
      },
      product_usage: {
        active_days_total: num(usage?.active_days_total),
        active_days_30d: num(usage?.active_days_30d),
        sessions_total: num(usage?.sessions_total),
        sessions_30d: num(usage?.sessions_30d),
        jobs_viewed: num(usage?.jobs_viewed),
        jobs_saved: num(usage?.jobs_saved),
        searches: num(usage?.searches),
        apply_clicks: num(usage?.apply_clicks),
        resume_uploaded: Boolean(m.resume_uploaded),
        auto_apply: {
          used: num(autoApply?.used),
          limit: num(autoApply?.usage_limit ?? 50),
          used_basis: autoApply?.used_basis ?? null,
          runs_started: num(autoApply?.started_total),
          successful: success,
          failed,
          success_rate_pct: success + failed === 0 ? null : Math.round((success / (success + failed)) * 1000) / 10,
        },
        milestones: m,
        features_adopted: milestones
          .filter((x) => x.milestone.startsWith("feature:"))
          .map((x) => ({ feature: x.milestone.slice(8), first_used_at: x.first_at })),
      },
      pql: pql
        ? {
            score: pql.score,
            category: pql.category,
            reasons: pql.reasons,
            priority: pql.priority,
            priority_trigger: pql.priority_trigger,
            priority_reason: pql.priority_reason,
            owner_team: pql.owner_team,
            next_best_action: pql.next_best_action,
            rules_version: pql.rules_version,
            computed_at: pql.computed_at,
          }
        : null,
      lifecycle: lifecycle
        ? {
            stage: lifecycle.stage,
            previous_stage: lifecycle.previous_stage,
            entered_at: lifecycle.entered_at,
            reason: lifecycle.reason,
          }
        : null,
      subscription: {
        is_paid: user.is_paid,
        plan: user.plan,
        subscriptions,
        payments: {
          successful: num(payments?.successful),
          failed: num(payments?.failed),
          failed_30d: num(payments?.failed_30d),
          lifetime_revenue: num(payments?.lifetime_revenue),
          last_success_at: payments?.last_success_at ?? null,
          last_failure_at: payments?.last_failure_at ?? null,
        },
        purchase_intent: {
          pricing_views: num(usage?.pricing_views),
          first_pricing_view_at: m.first_pricing_view ?? null,
          last_pricing_view_date: usage?.last_pricing_date ?? null,
          plan_clicks: num(usage?.plan_clicks),
          checkouts_started: num(usage?.checkouts_started),
          checkouts_abandoned: num(usage?.checkouts_abandoned),
        },
      },
      sales: {
        open_lead: lead,
        activity_counts: Object.fromEntries(activityCounts.map((a) => [a.type, { count: Number(a.n), last_at: a.last_at }])),
        pending_callbacks: callbacks,
        open_alerts: alerts,
      },
      product_health: {
        auto_apply_failures_7d: num(usage?.auto_apply_failed_7d),
        payment_failures_30d: num(payments?.failed_30d),
      },
    },
    meta: { pii: reveal ? "revealed" : "masked" },
    definitions: definitionsFor(["auto_apply_used", "lifecycle_stage", "active_users", "paid_users"]),
  };
}

interface EventRow {
  event_id: string;
  event_name: string;
  session_id: string | null;
  occurred_at: Date;
  page: string | null;
  properties: Record<string, unknown>;
  ingest_source: string;
}

export function formatEvent(e: EventRow) {
  const def = eventDefinition(e.event_name);
  return {
    event_id: e.event_id,
    event_name: e.event_name,
    label: def.label,
    family: def.family,
    importance: def.importance,
    occurred_at: e.occurred_at,
    page: e.page,
    source: e.ingest_source,
    properties: e.properties,
  };
}

/**
 * Timeline events for sessions: browser events by session_id, plus server events
 * for the user that happened while the session was live (they carry no session id).
 */
export async function eventsForSessions(
  userId: string,
  sessions: { session_id: string; started_at: Date; last_activity_at: Date }[],
  perSessionLimit = 200
) {
  if (sessions.length === 0) return new Map<string, EventRow[]>();
  const rows = await queryRows<EventRow & { bucket: string }>(
    `SELECT * FROM (
       SELECT s.session_id AS bucket, e.event_id, e.event_name, e.session_id, e.occurred_at, e.page, e.properties,
              e.ingest_source,
              row_number() OVER (PARTITION BY s.session_id ORDER BY e.occurred_at, e.event_id) AS rn
       FROM unnest($2::text[], $3::timestamptz[], $4::timestamptz[]) AS s(session_id, started_at, last_activity_at)
       JOIN user_events e ON (
              e.session_id = s.session_id
           OR (e.user_id = $1 AND e.session_id IS NULL AND e.ingest_source <> 'client'
               AND e.occurred_at BETWEEN s.started_at AND s.last_activity_at + interval '1 minute')
       )
     ) x WHERE rn <= $5 ORDER BY occurred_at, event_id`,
    [
      userId,
      sessions.map((s) => s.session_id),
      sessions.map((s) => s.started_at),
      sessions.map((s) => s.last_activity_at),
      perSessionLimit,
    ]
  );
  const map = new Map<string, EventRow[]>();
  for (const r of rows) {
    const list = map.get(r.bucket) ?? [];
    list.push(r);
    map.set(r.bucket, list);
  }
  return map;
}

export async function userSessions(userId: string, page: { limit: number; cursor?: string }, includeEvents: boolean) {
  await assertUserExists(userId);
  const c = decodeCursor(page.cursor);
  const params: unknown[] = [userId, page.limit + 1];
  let cursorSql = "";
  if (c) {
    params.push(c.ts, c.id);
    cursorSql = " AND (started_at, session_id) < ($3::timestamptz, $4)";
  }
  const sessions = await queryRows<{
    session_id: string;
    started_at: Date;
    last_activity_at: Date;
    ended_at: Date | null;
    duration_seconds: number;
    device_type: string | null;
    browser: string | null;
    os: string | null;
    country: string | null;
    landing_page: string | null;
    exit_page: string | null;
    acquisition: Record<string, unknown>;
    event_count: number;
    important_event_count: number;
  }>(
    `SELECT session_id, started_at, last_activity_at, ended_at, duration_seconds, device_type, browser, os, country,
            landing_page, exit_page, acquisition, event_count, important_event_count
     FROM user_sessions WHERE user_id = $1${cursorSql}
     ORDER BY started_at DESC, session_id DESC LIMIT $2`,
    params
  );
  const pageResult = keysetPage(sessions, page.limit, (s) => [s.started_at, s.session_id]);
  const events = includeEvents ? await eventsForSessions(userId, pageResult.data) : null;

  return {
    ...pageResult,
    data: pageResult.data.map((s) => ({
      ...s,
      is_current: s.ended_at === null,
      ...(events ? { events: (events.get(s.session_id) ?? []).map(formatEvent) } : {}),
    })),
  };
}

export async function pqlHistory(userId: string, page: { limit: number; cursor?: string }) {
  await assertUserExists(userId);
  const c = decodeCursor(page.cursor);
  const params: unknown[] = [userId, page.limit + 1];
  let cursorSql = "";
  if (c) {
    params.push(c.ts, c.id);
    cursorSql = " AND (computed_at, id) < ($3::timestamptz, $4::bigint)";
  }
  const rows = await queryRows<{ id: string; computed_at: Date; score: number; previous_score: number | null }>(
    `SELECT id, score, previous_score, score - COALESCE(previous_score, 0) AS delta, category, priority, priority_trigger,
            reasons, rules_version, computed_at
     FROM pql_score_history WHERE user_id = $1${cursorSql}
     ORDER BY computed_at DESC, id DESC LIMIT $2`,
    params
  );
  return keysetPage(rows, page.limit, (r) => [r.computed_at, r.id]);
}

export async function salesActivities(userId: string, page: { limit: number; cursor?: string }, type?: string) {
  await assertUserExists(userId);
  const c = decodeCursor(page.cursor);
  const params: unknown[] = [userId, page.limit + 1];
  let extra = "";
  if (type) {
    params.push(type);
    extra += ` AND a.type = $${params.length}`;
  }
  if (c) {
    params.push(c.ts, c.id);
    extra += ` AND (a.occurred_at, a.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  const rows = await queryRows<{ id: string; occurred_at: Date }>(
    `SELECT a.id, a.lead_id, a.type, a.outcome, a.disposition, a.body, a.duration_seconds, a.metadata, a.actor_id,
            tm.name AS actor_name, a.occurred_at, a.created_at
     FROM sales_activities a LEFT JOIN team_members tm ON tm.id::text = a.actor_id
     WHERE a.user_id = $1${extra}
     ORDER BY a.occurred_at DESC, a.id DESC LIMIT $2`,
    params
  );
  return keysetPage(rows, page.limit, (r) => [r.occurred_at, r.id]);
}
