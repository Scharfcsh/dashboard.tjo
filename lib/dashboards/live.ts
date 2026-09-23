import { withTransaction, queryOne, queryRows } from "@/lib/db/pool";
import { eventDefinition, eventNamesAtLeast, type Importance } from "@/lib/events/catalog";
import { notFound } from "@/lib/http/errors";
import { decodeCursor, keysetPage } from "@/lib/http/pagination";
import { definitionsFor } from "@/lib/metrics/definitions";
import { userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import { HOT_PQL_MIN_SCORE } from "@/lib/scoring/pql-config";
import { assignLead, assertTeamMember, findOpenLead, MANUAL_SLA_MINUTES, type LeadPriority } from "@/lib/sales/leads";
import { eventsForSessions, formatEvent } from "@/lib/dashboards/user360";
import { formatUserSummary, USER_SUMMARY_COLUMNS, USER_SUMMARY_JOINS, type UserSummaryRow } from "@/lib/users/summary";

// Dashboard 2 - Live User Behaviour Intelligence (SOP section 9).
// "Online" comes only from user_presence (heartbeat cache) via online_cutoff().

export async function liveSummary(f: UserFilters) {
  const p: unknown[] = [HOT_PQL_MIN_SCORE];
  const filter = userFilterSql(f, p);
  const row = await queryOne<Record<string, number>>(
    `WITH today AS (
       SELECT d.user_id, d.sessions_count, d.pricing_views FROM user_daily_metrics d
       JOIN users u ON u.user_id = d.user_id
       WHERE d.business_date = business_today() AND d.is_active${filter}
     )
     SELECT
       (SELECT count(*) FROM user_presence pr JOIN users u ON u.user_id = pr.user_id
         WHERE pr.last_seen_at > online_cutoff()${filter})                                           AS online_now,
       (SELECT count(*) FROM today)                                                                   AS active_today,
       (SELECT count(DISTINCT d.user_id) FROM user_daily_metrics d JOIN users u ON u.user_id = d.user_id
         WHERE d.business_date > business_today() - 7 AND d.is_active${filter})                       AS active_7d,
       (SELECT count(*) FROM user_sessions s JOIN users u ON u.user_id = s.user_id
         WHERE s.started_at >= business_day_start(business_today())${filter})                         AS sessions_today,
       (SELECT count(*) FROM today t JOIN pql_scores ps ON ps.user_id = t.user_id
         WHERE NOT ps.is_paid AND (ps.priority IN ('P0', 'P1') OR ps.score >= $1))                    AS high_intent_active,
       (SELECT count(*) FROM today WHERE pricing_views > 0)                                           AS pricing_activity,
       (SELECT count(*) FROM today t JOIN auto_apply_usage a ON a.user_id = t.user_id
         WHERE a.used >= 45 AND NOT is_paid_user(t.user_id))                                          AS near_free_limit`,
    p
  );
  return row ?? {};
}

export async function liveUsers(
  status: "online" | "today",
  f: UserFilters,
  page: { limit: number; offset: number },
  opts: { search?: string; minScore?: number; reveal: boolean }
) {
  const p: unknown[] = [];
  let where =
    status === "online"
      ? "WHERE pr.last_seen_at > online_cutoff()"
      : `WHERE EXISTS (SELECT 1 FROM user_daily_metrics d WHERE d.user_id = u.user_id
                        AND d.business_date = business_today() AND d.is_active)`;
  if (opts.search) {
    p.push(`%${opts.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where += ` AND (u.user_id ILIKE $${p.length} OR u.name ILIKE $${p.length} OR u.email ILIKE $${p.length} OR u.phone ILIKE $${p.length})`;
  }
  if (opts.minScore !== undefined) {
    p.push(opts.minScore);
    where += ` AND COALESCE(ps.score, 0) >= $${p.length}`;
  }
  where += userFilterSql(f, p);

  const [rows, total] = await Promise.all([
    queryRows<UserSummaryRow & { session_started_at: Date | null; session_last_activity_at: Date | null; pricing_views_today: number | null }>(
      `SELECT ${USER_SUMMARY_COLUMNS},
              cs.started_at AS session_started_at, cs.last_activity_at AS session_last_activity_at,
              td.pricing_views AS pricing_views_today
       FROM users u ${USER_SUMMARY_JOINS}
       LEFT JOIN user_sessions cs ON cs.session_id = pr.current_session_id
       LEFT JOIN user_daily_metrics td ON td.user_id = u.user_id AND td.business_date = business_today()
       ${where}
       ORDER BY is_online DESC, ps.priority ASC NULLS LAST, COALESCE(ps.score, 0) DESC, pr.last_seen_at DESC NULLS LAST, u.user_id
       LIMIT ${page.limit} OFFSET ${page.offset}`,
      p
    ),
    queryOne<{ n: number }>(
      `SELECT count(*) AS n FROM users u
       LEFT JOIN user_presence pr ON pr.user_id = u.user_id
       LEFT JOIN pql_scores ps ON ps.user_id = u.user_id
       ${where}`,
      p
    ),
  ]);

  const now = Date.now();
  const data = rows.map((r) => {
    const summary = formatUserSummary(r, opts.reveal);
    // A session's duration runs to "now" only while the user is online.
    const sessionDuration = r.session_started_at
      ? Math.round(((r.is_online ? now : (r.session_last_activity_at ?? r.session_started_at).getTime()) - r.session_started_at.getTime()) / 1000)
      : null;
    const pricingViews = r.pricing_views_today ?? 0;
    const pricingIntent = r.priority_trigger?.startsWith("checkout") || pricingViews >= 3 ? "high" : pricingViews > 0 ? "medium" : "low";
    return {
      ...summary,
      live_status: r.is_online ? "online" : "active_today",
      current_action: r.last_event_name ? eventDefinition(r.last_event_name).label : null,
      session_duration_seconds: sessionDuration,
      pricing_intent: pricingIntent,
    };
  });
  return { data, total: total?.n ?? 0, userIds: rows.map((r) => r.user_id) };
}

export async function currentSession(userId: string) {
  const user = await queryOne<{ current_session_id: string | null; is_online: boolean }>(
    `SELECT pr.current_session_id, COALESCE(pr.last_seen_at > online_cutoff(), false) AS is_online
     FROM users u LEFT JOIN user_presence pr ON pr.user_id = u.user_id WHERE u.user_id = $1`,
    [userId]
  );
  if (!user) throw notFound("User");

  const session = await queryOne<{
    session_id: string;
    started_at: Date;
    last_activity_at: Date;
    ended_at: Date | null;
    duration_seconds: number;
    device_type: string | null;
    browser: string | null;
    os: string | null;
    landing_page: string | null;
    event_count: number;
  }>(
    `SELECT session_id, started_at, last_activity_at, ended_at, duration_seconds, device_type, browser, os, landing_page, event_count
     FROM user_sessions
     WHERE user_id = $1
     ORDER BY (session_id = $2) DESC, last_activity_at DESC
     LIMIT 1`,
    [userId, user.current_session_id]
  );
  if (!session) return { data: null, meta: { reason: "No sessions built for this user yet" } };

  // The session row may lag the pipeline by a tick; extend the window to now while online.
  const window = { ...session, last_activity_at: user.is_online ? new Date() : session.last_activity_at };
  const events = (await eventsForSessions(userId, [window], 500)).get(session.session_id) ?? [];
  const sessionNumber = await queryOne<{ n: number }>(
    "SELECT count(*) AS n FROM user_sessions WHERE user_id = $1 AND started_at <= $2",
    [userId, session.started_at]
  );
  return {
    data: {
      ...session,
      is_online: user.is_online,
      is_current: session.ended_at === null,
      session_number: sessionNumber?.n ?? null,
      timeline: events.map(formatEvent),
    },
  };
}

export async function liveEvents(opts: {
  importance: Importance;
  limit: number;
  cursor?: string;
  userId?: string;
  eventName?: string;
  /** Restrict to these event names (e.g. only events a UI knows how to describe). */
  eventNames?: string[];
}) {
  const c = decodeCursor(opts.cursor);
  const params: unknown[] = [opts.limit + 1];
  let where = "WHERE e.event_name NOT IN ('heartbeat', 'page_view')";
  if (opts.importance !== "low") {
    params.push(eventNamesAtLeast(opts.importance));
    where += ` AND e.event_name = ANY($${params.length}::text[])`;
  }
  if (opts.userId) {
    params.push(opts.userId);
    where += ` AND COALESCE(e.user_id, il.user_id) = $${params.length}`;
  }
  if (opts.eventNames?.length) {
    params.push(opts.eventNames);
    where += ` AND e.event_name = ANY($${params.length}::text[])`;
  }
  if (opts.eventName) {
    params.push(opts.eventName);
    where += ` AND e.event_name = $${params.length}`;
  }
  if (c) {
    params.push(c.ts, c.id);
    where += ` AND (e.occurred_at, e.event_id) < ($${params.length - 1}::timestamptz, $${params.length})`;
  }
  // Bounded to 7 days so the stream stays an operational feed, not a log search.
  const rows = await queryRows<{
    event_id: string;
    event_name: string;
    occurred_at: Date;
    user_id: string | null;
    user_name: string | null;
    anonymous_id: string | null;
    page: string | null;
    properties: Record<string, unknown>;
    ingest_source: string;
    session_id: string | null;
  }>(
    `SELECT e.event_id, e.event_name, e.occurred_at, COALESCE(e.user_id, il.user_id) AS user_id, u.name AS user_name,
            e.anonymous_id, e.page, e.properties, e.ingest_source, e.session_id
     FROM user_events e
     LEFT JOIN identity_links il ON e.user_id IS NULL AND il.anonymous_id = e.anonymous_id
     LEFT JOIN users u ON u.user_id = COALESCE(e.user_id, il.user_id)
     ${where} AND e.occurred_at > now() - interval '7 days' AND e.occurred_at <= now() + interval '5 minutes'
     ORDER BY e.occurred_at DESC, e.event_id DESC
     LIMIT $1`,
    params
  );
  const page = keysetPage(rows, opts.limit, (r) => [r.occurred_at, r.event_id]);
  return {
    ...page,
    data: page.data.map((r) => {
      const def = eventDefinition(r.event_name);
      return {
        ...formatEvent(r),
        user_id: r.user_id,
        user_name: r.user_name,
        anonymous_id: r.user_id ? null : r.anonymous_id,
        session_id: r.session_id,
        summary: `${r.user_name ?? r.user_id ?? "Anonymous visitor"} - ${def.label}`,
      };
    }),
  };
}

/** Assign a user to a sales owner: reuse their open lead or open a manual one. */
export async function assignUser(input: {
  userId: string;
  ownerId: string;
  reason: string | null;
  priority?: LeadPriority;
  actor: string;
}) {
  return withTransaction(async (client) => {
    const user = await client.query<{ priority: LeadPriority | null; priority_reason: string | null; next_best_action: string | null; priority_trigger: string | null }>(
      `SELECT ps.priority, ps.priority_reason, ps.next_best_action, ps.priority_trigger
       FROM users u LEFT JOIN pql_scores ps ON ps.user_id = u.user_id WHERE u.user_id = $1`,
      [input.userId]
    );
    if (user.rowCount === 0) throw notFound("User");
    await assertTeamMember(client, input.ownerId);

    let lead = await findOpenLead(client, input.userId);
    let created = false;
    if (!lead) {
      const signal = user.rows[0]!;
      const priority = input.priority ?? signal.priority ?? "P2";
      // Manual assignment deliberately bypasses suppression: a human chose to act.
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO sales_leads (user_id, priority, reason, reason_code, source, next_action, next_action_at, sla_due_at)
         VALUES ($1, $2, $3, $4, 'manual', $5, now(), now() + make_interval(mins => $6))
         ON CONFLICT (user_id) WHERE status IN ('new', 'contacted', 'interested', 'callback') DO NOTHING
         RETURNING id`,
        [
          input.userId,
          priority,
          signal.priority_reason ?? input.reason ?? "Manually assigned",
          signal.priority_trigger ?? "manual",
          signal.next_best_action,
          MANUAL_SLA_MINUTES[priority],
        ]
      );
      created = Boolean(rows[0]);
      lead = await findOpenLead(client, input.userId);
      if (!lead) throw new Error("lead creation raced and lost");
    }

    const result = await assignLead(client, {
      leadId: lead.id,
      toOwnerId: input.ownerId,
      assignedBy: input.actor,
      reason: input.reason,
    });
    const { rows } = await client.query(
      `SELECT l.*, tm.name AS owner_name FROM sales_leads l LEFT JOIN team_members tm ON tm.id = l.owner_id WHERE l.id = $1`,
      [lead.id]
    );
    return { lead: rows[0], lead_created: created, owner_changed: result.changed, previous_owner_id: result.fromOwnerId };
  });
}

export const liveDefinitions = () => definitionsFor(["online_users", "active_users", "hot_pqls", "auto_apply_used"]);

