import type { PoolClient } from "pg";
import { audit } from "@/lib/audit";
import { queryOne, queryRows, withTransaction } from "@/lib/db/pool";
import { ApiError, notFound } from "@/lib/http/errors";
import { OPEN_LEAD_SQL } from "@/lib/jobs/sql";
import { pct } from "@/lib/metrics/definitions";
import { rangeMeta, type DateRange } from "@/lib/time/business-time";
import { withUserDetails } from "@/lib/user-details";
import { formatUserSummary, USER_SUMMARY_COLUMNS, type UserSummaryRow } from "@/lib/users/summary";

// ---------------------------------------------------------------------------
// Dashboard 5 - Sales Caller CRM (SOP sections 6 and 12).
//
// Call-next ranking (one ORDER BY used by both my-leads and next-lead):
//   1. callback due now            4. PQL score
//   2. P0 past SLA, uncontacted    5. most recently active user
//   3. priority (P0 > P1 > P2)
// Leads waiting on a future callback are not "next" until it is due.
// ---------------------------------------------------------------------------

export const DISPOSITIONS = [
  "interested",
  "wants_to_buy",
  "callback",
  "no_answer",
  "whatsapp_requested",
  "price_concern",
  "feature_concern",
  "needs_support",
  "not_interested",
  "converted",
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const ACTIVITY_OUTCOMES = ["connected", "no_answer", "busy", "wrong_number", "voicemail", "sent", "delivered", "failed"] as const;

export const SALES_CONFIG = {
  notInterestedSuppressDays: 30,
  noAnswerRetryMinutes: 120,
};

const LEAD_COLUMNS = `
  l.id AS lead_id_, l.status AS lead_status_, l.priority AS lead_priority, l.reason AS lead_reason, l.reason_code,
  l.source AS lead_source, l.attempts, l.last_contacted_at AS lead_last_contacted_at, l.last_disposition,
  l.next_action, l.next_action_at, l.sla_due_at, l.created_at AS lead_created_at, l.owner_id AS lead_owner_id,
  (l.sla_due_at < now() AND l.last_contacted_at IS NULL) AS sla_breached,
  cb.id AS callback_id, cb.due_at AS callback_due_at, (cb.due_at <= now()) AS callback_due,
  pend.pending_disposition, ps.facts AS pql_facts, u.city, up.target_role`;

const LEAD_JOINS = `
  JOIN users u ON u.user_id = l.user_id
  LEFT JOIN lifecycle_state ls   ON ls.user_id = u.user_id
  LEFT JOIN pql_scores ps        ON ps.user_id = u.user_id
  LEFT JOIN auto_apply_usage aau ON aau.user_id = u.user_id
  LEFT JOIN user_presence pr     ON pr.user_id = u.user_id
  LEFT JOIN team_members tm      ON tm.id = l.owner_id
  LEFT JOIN user_profiles up     ON up.user_id = u.user_id
  LEFT JOIN LATERAL (SELECT l.id, l.status, l.owner_id, l.last_contacted_at) lead ON true
  LEFT JOIN LATERAL (
    SELECT c.id, c.due_at FROM callbacks c WHERE c.lead_id = l.id AND c.status = 'pending' ORDER BY c.due_at LIMIT 1
  ) cb ON true
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM sales_activities a
      WHERE a.lead_id = l.id AND a.type = 'call' AND a.outcome = 'connected'
        AND NOT EXISTS (SELECT 1 FROM sales_activities d WHERE d.lead_id = l.id AND d.type = 'disposition' AND d.occurred_at >= a.occurred_at)
    ) AS pending_disposition
  ) pend ON true`;

const CALL_NEXT_ORDER = `
  ORDER BY (cb.due_at IS NOT NULL AND cb.due_at <= now()) DESC,
           (l.priority = 'P0' AND l.sla_due_at < now() AND l.last_contacted_at IS NULL) DESC,
           l.priority ASC,
           COALESCE(ps.score, 0) DESC,
           u.last_active_at DESC NULLS LAST,
           l.created_at ASC`;

type LeadRow = UserSummaryRow & Record<string, unknown>;

interface IntentFacts {
  pricingViews30d?: number;
  planClicks30d?: number;
  checkoutStarted30d?: number;
  checkoutAbandoned7d?: boolean;
  paymentFailedUnresolved?: boolean;
}

/** The buying signals a caller acts on, read from the stored scoring snapshot. */
function intentSignals(facts: IntentFacts | null) {
  const f = facts ?? {};
  return {
    pricing_views_30d: f.pricingViews30d ?? 0,
    plan_clicks_30d: f.planClicks30d ?? 0,
    checkout_started: (f.checkoutStarted30d ?? 0) > 0,
    checkout_abandoned: f.checkoutAbandoned7d ?? false,
    payment_failed: f.paymentFailedUnresolved ?? false,
  };
}

/** One lead row with the user's name and contact details from the product database. */
async function withDetails(row: LeadRow): Promise<LeadRow> {
  return (await withUserDetails([row]))[0]!;
}

function formatLead(r: LeadRow, reveal: boolean) {
  return {
    lead: {
      id: r.lead_id_,
      status: r.lead_status_,
      priority: r.lead_priority,
      reason: r.lead_reason,
      reason_code: r.reason_code,
      source: r.lead_source,
      owner_id: r.lead_owner_id,
      attempts: r.attempts,
      last_contacted_at: r.lead_last_contacted_at,
      last_disposition: r.last_disposition,
      next_action: r.next_action,
      next_action_at: r.next_action_at,
      sla_due_at: r.sla_due_at,
      sla_breached: r.sla_breached,
      pending_disposition: r.pending_disposition,
      next_callback: r.callback_id ? { id: r.callback_id, due_at: r.callback_due_at, is_due: r.callback_due } : null,
      created_at: r.lead_created_at,
    },
    user: formatUserSummary(r, reveal),
    signals: intentSignals(r.pql_facts as IntentFacts | null),
    context: { city: (r.city as string | null) ?? null, target_role: (r.target_role as string | null) ?? null },
    recommended_pitch: {
      next_best_action: r.next_best_action,
      why: (r.pql_reasons ?? []).slice(0, 4).map((x) => x.label),
    },
  };
}

/**
 * Owner filter for the caller-scoped queries below. A null owner means the whole
 * team (the manager view), so every lead matches - assigned or not.
 */
const ownedBy = (column: string, param: string) => `(${param}::uuid IS NULL OR ${column} = ${param})`;

export async function myLeads(
  ownerId: string | null,
  page: { limit: number; offset: number },
  opts: { status: "open" | "all"; priority?: string; reveal: boolean }
) {
  const p: unknown[] = [ownerId];
  let where = `WHERE ${ownedBy("l.owner_id", "$1")}`;
  if (opts.status === "open") where += ` AND l.status IN ${OPEN_LEAD_SQL}`;
  if (opts.priority) {
    p.push(opts.priority);
    where += ` AND l.priority = $${p.length}`;
  }
  const [rows, total, counts] = await Promise.all([
    queryRows<LeadRow>(
      `SELECT ${USER_SUMMARY_COLUMNS}, ${LEAD_COLUMNS} FROM sales_leads l ${LEAD_JOINS} ${where} ${CALL_NEXT_ORDER}
       LIMIT ${page.limit} OFFSET ${page.offset}`,
      p
    ),
    queryOne<{ n: number }>(`SELECT count(*) AS n FROM sales_leads l ${where}`, p),
    queryOne<Record<string, number>>(
      `SELECT count(*) FILTER (WHERE status IN ${OPEN_LEAD_SQL})                                             AS open,
              count(*) FILTER (WHERE status IN ${OPEN_LEAD_SQL} AND priority = 'P0')                         AS call_immediately,
              count(*) FILTER (WHERE status IN ${OPEN_LEAD_SQL} AND last_contacted_at IS NULL)               AS pending_first_contact,
              count(*) FILTER (WHERE created_at >= business_day_start(business_today()))                     AS assigned_today,
              count(*) FILTER (WHERE status = 'converted' AND closed_at >= business_day_start(business_today())) AS converted_today,
              (SELECT count(*) FROM callbacks c WHERE ${ownedBy("c.owner_id", "$1")} AND c.status = 'pending'
                 AND c.due_at < business_day_start(business_today() + 1))                                    AS callbacks_due_today
       FROM sales_leads WHERE ${ownedBy("owner_id", "$1")}`,
      [ownerId]
    ),
  ]);
  const detailed = await withUserDetails(rows);
  return { data: detailed.map((r) => formatLead(r, opts.reveal)), total: total?.n ?? 0, summary: counts, userIds: rows.map((r) => r.user_id) };
}

export async function nextLead(ownerId: string | null, includeUnassigned: boolean, reveal: boolean) {
  const readyFilter = `l.status IN ${OPEN_LEAD_SQL}
     AND NOT EXISTS (SELECT 1 FROM callbacks c WHERE c.lead_id = l.id AND c.status = 'pending' AND c.due_at > now()
                     AND NOT EXISTS (SELECT 1 FROM callbacks c2 WHERE c2.lead_id = l.id AND c2.status = 'pending' AND c2.due_at <= now()))
     AND (l.next_action_at IS NULL OR l.next_action_at <= now())`;

  const mine = await queryOne<LeadRow>(
    `SELECT ${USER_SUMMARY_COLUMNS}, ${LEAD_COLUMNS} FROM sales_leads l ${LEAD_JOINS}
     WHERE ${ownedBy("l.owner_id", "$1")} AND ${readyFilter} ${CALL_NEXT_ORDER} LIMIT 1`,
    [ownerId]
  );
  if (mine) return { data: formatLead(await withDetails(mine), reveal), source: "assigned" as const };
  if (!includeUnassigned) return { data: null, source: null };

  const unassigned = await queryOne<LeadRow>(
    `SELECT ${USER_SUMMARY_COLUMNS}, ${LEAD_COLUMNS} FROM sales_leads l ${LEAD_JOINS}
     WHERE l.owner_id IS NULL AND ${readyFilter} ${CALL_NEXT_ORDER} LIMIT 1`
  );
  return unassigned ? { data: formatLead(await withDetails(unassigned), reveal), source: "unassigned_pool" as const } : { data: null, source: null };
}

async function lockLead(client: PoolClient, leadId: string) {
  const { rows } = await client.query<{ id: string; user_id: string; status: string; owner_id: string | null; priority: string }>(
    "SELECT id, user_id, status, owner_id, priority FROM sales_leads WHERE id = $1 FOR UPDATE",
    [leadId]
  );
  if (!rows[0]) throw notFound("Lead");
  return rows[0];
}

const isOpen = (status: string) => ["new", "contacted", "interested", "callback"].includes(status);

export async function logActivity(
  leadId: string,
  actor: string,
  input: { type: "call" | "whatsapp" | "email" | "note"; outcome?: string; body?: string; duration_seconds?: number; occurred_at?: string }
) {
  return withTransaction(async (client) => {
    const lead = await lockLead(client, leadId);
    const { rows } = await client.query(
      `INSERT INTO sales_activities (lead_id, user_id, actor_id, type, outcome, body, duration_seconds, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))
       RETURNING *`,
      [leadId, lead.user_id, actor, input.type, input.outcome ?? null, input.body ?? null, input.duration_seconds ?? null, input.occurred_at ?? null]
    );
    if (input.type !== "note" && isOpen(lead.status)) {
      await client.query(
        `UPDATE sales_leads SET
           last_contacted_at = GREATEST(COALESCE(last_contacted_at, $2::timestamptz), $2::timestamptz),
           attempts = attempts + CASE WHEN $3 = 'call' THEN 1 ELSE 0 END,
           status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
           updated_at = now()
         WHERE id = $1`,
        [leadId, rows[0].occurred_at, input.type]
      );
    }
    await audit({ actorId: actor, action: `activity.${input.type}`, entityType: "sales_lead", entityId: leadId, after: rows[0] }, client);
    return {
      activity: rows[0],
      // SOP 12: a completed call must be dispositioned.
      disposition_required: input.type === "call" && input.outcome === "connected",
    };
  });
}

export async function setDisposition(
  leadId: string,
  actor: string,
  input: { disposition: Disposition; notes?: string; callback_at?: string; suppress_days?: number; objection?: string }
) {
  return withTransaction(async (client) => {
    const lead = await lockLead(client, leadId);
    if (!isOpen(lead.status)) {
      throw new ApiError("INVALID_STATE", `Lead is already ${lead.status}; dispositions apply to open leads only`);
    }

    let callback: unknown = null;
    let supportAlert: string | null = null;
    const set: Record<string, unknown> = { last_disposition: input.disposition };

    switch (input.disposition) {
      case "interested":
        Object.assign(set, { status: "interested", next_action: "follow_up", next_action_at: null });
        break;
      case "wants_to_buy":
        // Payment links are generated in the main app; this records the path to take.
        Object.assign(set, { status: "interested", next_action: "send_payment_link", next_action_at: null });
        break;
      case "callback": {
        if (!input.callback_at) throw new ApiError("VALIDATION_FAILED", "callback_at is required for a callback disposition");
        const { rows } = await client.query(
          `INSERT INTO callbacks (lead_id, user_id, owner_id, due_at, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [leadId, lead.user_id, lead.owner_id, input.callback_at, input.notes ?? null, actor]
        );
        callback = rows[0];
        Object.assign(set, { status: "callback", next_action: "callback", next_action_at: input.callback_at });
        break;
      }
      case "no_answer":
        // Retry policy: never mark lost for a missed call.
        Object.assign(set, {
          status: "contacted",
          next_action: "retry_call",
          next_action_at: new Date(Date.now() + SALES_CONFIG.noAnswerRetryMinutes * 60_000).toISOString(),
        });
        break;
      case "whatsapp_requested":
        Object.assign(set, { status: "contacted", next_action: "send_whatsapp_template", next_action_at: null });
        break;
      case "price_concern":
      case "feature_concern":
        Object.assign(set, { status: "contacted", next_action: input.disposition === "price_concern" ? "address_price_objection" : "share_product_feedback" });
        break;
      case "needs_support": {
        Object.assign(set, { status: "contacted", next_action: "support_handoff", next_action_at: null });
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO alerts (rule_id, rule_version, user_id, priority, category, owner_team, title, reason, idempotency_key, sla_due_at, context)
           SELECT r.id, r.version, $1, r.priority, r.category, r.owner_team, r.name, $2, $3, now() + make_interval(mins => r.sla_minutes), $4
           FROM alert_rules r WHERE r.id = 'sales_support_handoff'
           ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
          [lead.user_id, input.notes ?? "Caller requested support handoff", `sales_support_handoff:${leadId}:${new Date().toISOString().slice(0, 13)}`, JSON.stringify({ lead_id: leadId, actor })]
        );
        supportAlert = rows[0]?.id ?? null;
        break;
      }
      case "not_interested": {
        const days = input.suppress_days ?? SALES_CONFIG.notInterestedSuppressDays;
        Object.assign(set, {
          status: "lost",
          closed_at: new Date().toISOString(),
          next_action: null,
          next_action_at: null,
          suppressed_until: new Date(Date.now() + days * 86_400_000).toISOString(),
        });
        break;
      }
      case "converted":
        Object.assign(set, { status: "converted", closed_at: new Date().toISOString(), next_action: null, next_action_at: null });
        break;
    }

    const keys = Object.keys(set);
    const { rows: updated } = await client.query(
      `UPDATE sales_leads SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [leadId, ...keys.map((k) => set[k])]
    );
    if (["callback", "not_interested", "converted"].includes(input.disposition)) {
      // A closed lead or a newly scheduled callback supersedes older pending callbacks.
      await client.query(
        `UPDATE callbacks SET status = 'cancelled', completed_at = now()
         WHERE lead_id = $1 AND status = 'pending' AND ($2::uuid IS NULL OR id <> $2::uuid)`,
        [leadId, (callback as { id?: string } | null)?.id ?? null]
      );
    }
    const { rows: activity } = await client.query(
      `INSERT INTO sales_activities (lead_id, user_id, actor_id, type, disposition, body, metadata)
       VALUES ($1, $2, $3, 'disposition', $4, $5, $6) RETURNING *`,
      [leadId, lead.user_id, actor, input.disposition, input.notes ?? null, JSON.stringify({ objection: input.objection ?? null, callback_at: input.callback_at ?? null })]
    );
    await audit(
      { actorId: actor, action: "lead.disposition", entityType: "sales_lead", entityId: leadId, before: { status: lead.status }, after: { ...set } },
      client
    );
    return { lead: updated[0], activity: activity[0], callback, support_alert_id: supportAlert };
  });
}

export async function scheduleCallback(leadId: string, actor: string, input: { due_at: string; notes?: string; owner_id?: string }) {
  if (Date.parse(input.due_at) < Date.now() - 60_000) throw new ApiError("VALIDATION_FAILED", "due_at must be in the future");
  return withTransaction(async (client) => {
    const lead = await lockLead(client, leadId);
    if (!isOpen(lead.status)) throw new ApiError("INVALID_STATE", `Lead is ${lead.status}; callbacks need an open lead`);
    const ownerId = input.owner_id ?? lead.owner_id;
    if (input.owner_id) {
      const { rowCount } = await client.query("SELECT 1 FROM team_members WHERE id = $1 AND active", [input.owner_id]);
      if (!rowCount) throw new ApiError("NOT_FOUND", "Team member not found or inactive");
    }
    const { rows } = await client.query(
      `INSERT INTO callbacks (lead_id, user_id, owner_id, due_at, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [leadId, lead.user_id, ownerId, input.due_at, input.notes ?? null, actor]
    );
    await client.query(
      `UPDATE sales_leads SET status = 'callback', next_action = 'callback',
              next_action_at = LEAST(COALESCE(next_action_at, $2::timestamptz), $2::timestamptz), updated_at = now()
       WHERE id = $1`,
      [leadId, input.due_at]
    );
    await audit({ actorId: actor, action: "callback.scheduled", entityType: "sales_lead", entityId: leadId, after: rows[0] }, client);
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// Caller-scoped reads for the CRM workspace. Every number the page shows comes
// from one of these, and each carries its definition, so a caller and their
// manager can never be looking at two different meanings of "connected".
// ---------------------------------------------------------------------------

/**
 * Revenue credited to a caller: successful payments by users whose lead that
 * caller owns, made AFTER the lead was created. A customer who was already
 * paying before the lead existed is not the caller's work. Written once here
 * and reused by the leaderboard.
 */
const callerRevenueSql = (ownerParam: string, fromParam: string, toParam: string) => `
  SELECT COALESCE(sum(pe.amount), 0)::float8
  FROM payment_events pe
  JOIN sales_leads sl ON sl.user_id = pe.user_id AND ${ownedBy("sl.owner_id", ownerParam)}
  WHERE pe.status = 'success' AND pe.occurred_at >= sl.created_at
    AND pe.occurred_at >= ${fromParam} AND pe.occurred_at < ${toParam}`;

export async function callerKpis(ownerId: string | null, range: DateRange) {
  const row = await queryOne<Record<string, number>>(
    `SELECT
       count(*) FILTER (WHERE l.status IN ${OPEN_LEAD_SQL})                                     AS open_leads,
       count(*) FILTER (WHERE l.status IN ${OPEN_LEAD_SQL} AND l.priority = 'P0')               AS call_immediately,
       count(*) FILTER (WHERE l.status IN ${OPEN_LEAD_SQL} AND l.last_contacted_at IS NULL)     AS pending_first_contact,
       count(*) FILTER (WHERE l.created_at >= $2 AND l.created_at < $3)                         AS assigned_in_range,
       count(*) FILTER (WHERE l.created_at >= $4 AND l.created_at < $5)                         AS assigned_previous,
       count(*) FILTER (WHERE l.status = 'converted' AND l.closed_at >= $2 AND l.closed_at < $3) AS converted_in_range,
       count(*) FILTER (WHERE l.status = 'converted' AND l.closed_at >= $4 AND l.closed_at < $5) AS converted_previous,
       (SELECT count(*) FROM callbacks c WHERE ${ownedBy("c.owner_id", "$1")} AND c.status = 'pending'
          AND c.due_at < business_day_start(business_today() + 1))                              AS callbacks_due,
       (SELECT count(DISTINCT a.lead_id) FROM sales_activities a JOIN sales_leads sl ON sl.id = a.lead_id
          WHERE ${ownedBy("sl.owner_id", "$1")} AND a.type = 'call' AND a.outcome = 'connected'
            AND a.occurred_at >= $2 AND a.occurred_at < $3)                                     AS connected_in_range,
       (SELECT count(DISTINCT a.lead_id) FROM sales_activities a JOIN sales_leads sl ON sl.id = a.lead_id
          WHERE ${ownedBy("sl.owner_id", "$1")} AND a.type IN ('call', 'whatsapp', 'email')
            AND a.occurred_at >= $2 AND a.occurred_at < $3)                                     AS contacted_in_range,
       (${callerRevenueSql("$1", "$2", "$3")})                                                 AS revenue_in_range
     FROM sales_leads l WHERE ${ownedBy("l.owner_id", "$1")}`,
    [ownerId, range.startUtc, range.endUtc, range.previous.startUtc, range.previous.endUtc]
  );

  const n = (k: string) => Number(row?.[k] ?? 0);
  const contacted = n("contacted_in_range");
  const connected = n("connected_in_range");
  return {
    data: {
      assigned: { value: n("assigned_in_range"), previous: n("assigned_previous") },
      call_immediately: n("call_immediately"),
      pending_first_contact: n("pending_first_contact"),
      callbacks_due: n("callbacks_due"),
      connected: { value: connected, connect_rate_pct: pct(connected, contacted), contacted },
      converted: { value: n("converted_in_range"), previous: n("converted_previous") },
      revenue: n("revenue_in_range"),
      open_leads: n("open_leads"),
    },
    meta: {
      ...rangeMeta(range),
      owner_id: ownerId,
      definitions: {
        assigned: "Leads created for this caller inside the range.",
        call_immediately: "Open P0 leads in the queue right now (not range-bound).",
        pending_first_contact: "Open leads this caller has never contacted.",
        callbacks_due: "Pending callbacks owned by this caller due before the end of today.",
        connected: "Distinct leads with a call whose outcome was 'connected' inside the range.",
        connect_rate_pct: "Connected leads as a share of leads contacted by any channel inside the range.",
        converted: "Leads closed as converted inside the range.",
        revenue:
          "Successful payments inside the range by users whose lead this caller owns, made after the lead was created.",
      },
    },
  };
}

/**
 * Today's pool of active users, ranked by how a caller should treat them.
 * Order matters: the first matching band wins, and a product failure outranks
 * every buying signal - SOP 5.3 routes repeated failures to support first.
 */
// Listed in the order a caller reads them. The SQL CASE below evaluates
// product_issue first regardless, because support outranks selling.
export const LEAD_POOL_SEGMENTS = [
  { key: "hot", label: "Hot", action: "Call first" },
  { key: "warm", label: "Warm", action: "Call today" },
  { key: "engaged", label: "Engaged", action: "Nurture" },
  { key: "new_early", label: "New / Early", action: "Activation support" },
  { key: "product_issue", label: "Product Issue", action: "Support before selling" },
] as const;

export type LeadPoolSegment = (typeof LEAD_POOL_SEGMENTS)[number]["key"];

export async function leadPool(range: DateRange) {
  const rows = await queryRows<{ segment: string; users: number }>(
    `WITH active AS (
       SELECT DISTINCT d.user_id
       FROM user_daily_metrics d
       WHERE d.is_active AND d.business_date >= $1::date AND d.business_date <= $2::date
     )
     SELECT CASE
              WHEN ps.priority_trigger = 'repeated_failure'
                OR EXISTS (SELECT 1 FROM alerts al WHERE al.user_id = a.user_id
                             AND al.owner_team = 'support' AND al.status <> 'resolved')  THEN 'product_issue'
              WHEN COALESCE(ps.score, 0) >= 90 OR ps.priority = 'P0'                     THEN 'hot'
              WHEN COALESCE(ps.score, 0) >= 75 OR ps.priority = 'P1'                     THEN 'warm'
              WHEN COALESCE(ps.score, 0) >= 40                                           THEN 'engaged'
              ELSE 'new_early'
            END AS segment,
            count(*) AS users
     FROM active a
     LEFT JOIN pql_scores ps ON ps.user_id = a.user_id
     WHERE NOT is_paid_user(a.user_id)
     GROUP BY 1`,
    [range.from, range.to]
  );
  const counts = new Map(rows.map((r) => [r.segment, Number(r.users)]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return {
    data: {
      active_users: total,
      segments: LEAD_POOL_SEGMENTS.map((s) => ({
        ...s,
        users: counts.get(s.key) ?? 0,
        share_pct: pct(counts.get(s.key) ?? 0, total),
      })),
    },
    meta: {
      ...rangeMeta(range),
      definition:
        "Unpaid users with meaningful activity in the range, in the first band they match. A product failure outranks every buying signal.",
    },
  };
}

/**
 * The caller's pipeline. Each lead counts once, in the furthest stage it has
 * reached, so the strip can never total more than the caller's leads.
 */
export const PIPELINE_STAGES = [
  { key: "new_lead", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "connected", label: "Connected" },
  { key: "interested", label: "Interested" },
  { key: "follow_up", label: "Follow-Up" },
  { key: "payment_link", label: "Payment Link" },
  { key: "converted", label: "Converted" },
] as const;

export async function callerPipeline(ownerId: string | null) {
  const rows = await queryRows<{ stage: string; leads: number }>(
    `SELECT CASE
              WHEN l.status = 'converted'                                   THEN 'converted'
              WHEN l.next_action = 'send_payment_link'                      THEN 'payment_link'
              WHEN l.status = 'callback' OR l.next_action = 'follow_up'     THEN 'follow_up'
              WHEN l.status = 'interested'                                  THEN 'interested'
              WHEN connected.yes                                            THEN 'connected'
              WHEN l.status = 'contacted'                                   THEN 'contacted'
              ELSE 'new_lead'
            END AS stage,
            count(*) AS leads
     FROM sales_leads l
     LEFT JOIN LATERAL (
       SELECT EXISTS (SELECT 1 FROM sales_activities a
                      WHERE a.lead_id = l.id AND a.type = 'call' AND a.outcome = 'connected') AS yes
     ) connected ON true
     WHERE ${ownedBy("l.owner_id", "$1")} AND l.status <> 'lost'
     GROUP BY 1`,
    [ownerId]
  );
  const counts = new Map(rows.map((r) => [r.stage, Number(r.leads)]));
  return {
    data: {
      stages: PIPELINE_STAGES.map((s) => ({ ...s, leads: counts.get(s.key) ?? 0 })),
      total: [...counts.values()].reduce((a, b) => a + b, 0),
    },
    meta: {
      owner_id: ownerId,
      definition: "Every open or converted lead counted once, in the furthest stage it has reached. Lost leads are excluded.",
    },
  };
}

/** Pending callbacks for a caller, soonest first. The list behind the count. */
export async function callbacksDue(ownerId: string | null, range: DateRange, limit: number) {
  const rows = await queryRows<{
    id: string;
    lead_id: string;
    user_id: string;
    name: string | null;
    due_at: Date;
    notes: string | null;
    priority: string | null;
    reason: string | null;
    is_due: boolean;
  }>(
    `SELECT c.id, c.lead_id, c.user_id, u.name, c.due_at, c.notes,
            l.priority, l.reason, (c.due_at <= now()) AS is_due
     FROM callbacks c
     JOIN sales_leads l ON l.id = c.lead_id
     LEFT JOIN users u ON u.user_id = c.user_id
     WHERE ${ownedBy("c.owner_id", "$1")} AND c.status = 'pending' AND c.due_at < $2
     ORDER BY c.due_at
     LIMIT ${limit}`,
    [ownerId, range.endUtc]
  );
  return {
    data: await withUserDetails(rows),
    meta: { ...rangeMeta(range), owner_id: ownerId, definition: "Pending callbacks due before the end of the range." },
  };
}

/**
 * Response SLA. `ownerId` null means the whole team (manager view).
 * First response = the gap between a lead being created and its first contact.
 */
export async function slaMetrics(ownerId: string | null) {
  const p: unknown[] = [];
  let scope = "";
  if (ownerId) {
    p.push(ownerId);
    scope = " AND l.owner_id = $1";
  }
  const row = await queryOne<{
    avg_first_response_seconds: number | null;
    p0_contacted: number;
    p0_within_sla: number;
    overdue_p0: number;
    unassigned_hot: number;
  }>(
    `SELECT
       avg(extract(epoch FROM l.last_contacted_at - l.created_at))
         FILTER (WHERE l.last_contacted_at IS NOT NULL)                                   AS avg_first_response_seconds,
       count(*) FILTER (WHERE l.priority = 'P0' AND l.last_contacted_at IS NOT NULL)      AS p0_contacted,
       count(*) FILTER (WHERE l.priority = 'P0' AND l.last_contacted_at IS NOT NULL
                          AND l.last_contacted_at <= l.sla_due_at)                        AS p0_within_sla,
       count(*) FILTER (WHERE l.priority = 'P0' AND l.status IN ${OPEN_LEAD_SQL}
                          AND l.last_contacted_at IS NULL AND l.sla_due_at < now())       AS overdue_p0,
       count(*) FILTER (WHERE l.owner_id IS NULL AND l.status IN ${OPEN_LEAD_SQL}
                          AND l.priority = 'P0')                                          AS unassigned_hot
     FROM sales_leads l WHERE true${scope}`,
    p
  );
  const contacted = Number(row?.p0_contacted ?? 0);
  return {
    data: {
      avg_first_response_seconds:
        row?.avg_first_response_seconds === null || row?.avg_first_response_seconds === undefined
          ? null
          : Math.round(Number(row.avg_first_response_seconds)),
      p0_within_sla_pct: pct(Number(row?.p0_within_sla ?? 0), contacted),
      p0_contacted: contacted,
      overdue_p0: Number(row?.overdue_p0 ?? 0),
      // Unassigned leads belong to nobody, so this is always team-wide.
      unassigned_hot: Number(row?.unassigned_hot ?? 0),
    },
    meta: {
      owner_id: ownerId,
      definitions: {
        avg_first_response_seconds: "Mean time from lead creation to its first contact, over leads ever contacted.",
        p0_within_sla_pct: "Share of contacted P0 leads whose first contact landed before sla_due_at.",
        overdue_p0: "Open P0 leads past their SLA with no contact yet.",
        unassigned_hot: "Open P0 leads with no owner - team-wide, since they belong to nobody.",
      },
    },
  };
}

/**
 * Team performance, grouped by the lead's OWNER rather than by who typed the
 * activity, so work is credited to the person who owns the relationship.
 */
export async function callerLeaderboard(range: DateRange) {
  const rows = await queryRows<Record<string, string | number | null>>(
    `SELECT tm.id AS caller_id, tm.name, tm.role,
            count(DISTINCT l.id) FILTER (WHERE l.created_at >= $1 AND l.created_at < $2)          AS leads,
            count(DISTINCT a.id) FILTER (WHERE a.type = 'call')                                  AS calls,
            count(DISTINCT a.lead_id) FILTER (WHERE a.type = 'call' AND a.outcome = 'connected')  AS connections,
            count(DISTINCT a.lead_id) FILTER (WHERE a.type = 'disposition'
                                               AND a.disposition IN ('interested', 'wants_to_buy')) AS interested,
            count(DISTINCT l.id) FILTER (WHERE l.status = 'converted'
                                          AND l.closed_at >= $1 AND l.closed_at < $2)             AS conversions
     FROM team_members tm
     LEFT JOIN sales_leads l ON l.owner_id = tm.id
     LEFT JOIN sales_activities a ON a.lead_id = l.id AND a.occurred_at >= $1 AND a.occurred_at < $2
     WHERE tm.active AND tm.role IN ('caller', 'sales_manager')
     GROUP BY tm.id, tm.name, tm.role
     ORDER BY conversions DESC, connections DESC, calls DESC, tm.name`,
    [range.startUtc, range.endUtc]
  );

  const revenue = await queryRows<{ owner_id: string; revenue: number }>(
    `SELECT sl.owner_id, COALESCE(sum(pe.amount), 0)::float8 AS revenue
     FROM payment_events pe
     JOIN sales_leads sl ON sl.user_id = pe.user_id AND sl.owner_id IS NOT NULL
     WHERE pe.status = 'success' AND pe.occurred_at >= sl.created_at
       AND pe.occurred_at >= $1 AND pe.occurred_at < $2
     GROUP BY sl.owner_id`,
    [range.startUtc, range.endUtc]
  );
  const byOwner = new Map(revenue.map((r) => [r.owner_id, Number(r.revenue)]));

  return {
    data: {
      callers: rows.map((r) => {
        const leads = Number(r.leads ?? 0);
        const conversions = Number(r.conversions ?? 0);
        return {
          caller_id: String(r.caller_id),
          name: r.name as string | null,
          role: r.role as string,
          leads,
          calls: Number(r.calls ?? 0),
          connections: Number(r.connections ?? 0),
          interested: Number(r.interested ?? 0),
          conversions,
          revenue: byOwner.get(String(r.caller_id)) ?? 0,
          conversion_rate_pct: pct(conversions, leads),
        };
      }),
    },
    meta: {
      ...rangeMeta(range),
      definition:
        "Grouped by the lead's owner, not by who logged the activity. Conversion rate is conversions over leads received in the range.",
    },
  };
}

/** One lead with everything the detail rail shows. */
export async function leadById(leadId: string, reveal: boolean) {
  const row = await queryOne<LeadRow>(
    `SELECT ${USER_SUMMARY_COLUMNS}, ${LEAD_COLUMNS} FROM sales_leads l ${LEAD_JOINS} WHERE l.id = $1`,
    [leadId]
  );
  if (!row) throw notFound("Lead");
  return formatLead(await withDetails(row), reveal);
}
