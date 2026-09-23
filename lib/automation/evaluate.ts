import { getPool, type Queryable } from "@/lib/db/pool";
import { compileConditions } from "@/lib/segments/conditions";
import { upsertRuleLead, type LeadPriority } from "@/lib/sales/leads";

// ---------------------------------------------------------------------------
// Rule evaluation, shared by the live alert job and the dry-run test endpoint.
//
// Rule actions supported in this pass:
//   create_alert   idempotent alert (rule + user + cooldown window)
//   create_lead    open sales lead, or escalate an existing one
//   send_whatsapp / send_email / notify   recorded as skipped - no provider is
//                  wired up, and nothing in this service contacts a user.
// ---------------------------------------------------------------------------

export interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  conditions: unknown;
  actions: { type: string; [k: string]: unknown }[];
  priority: LeadPriority;
  owner_team: string;
  sla_minutes: number;
  cooldown_hours: number;
  version: number;
}

export interface RuleMatch {
  user_id: string;
  name: string | null;
  pql_score: number;
  priority: LeadPriority | null;
  priority_trigger: string | null;
  priority_reason: string | null;
  next_best_action: string | null;
  auto_apply_used: number;
  lifecycle_stage: string;
  has_open_lead: boolean;
}

export const SUPPORTED_ACTIONS = ["create_alert", "create_lead", "send_whatsapp", "send_email", "notify"] as const;
const COMMUNICATION_ACTIONS = new Set(["send_whatsapp", "send_email", "notify"]);

/** Users matching a rule's conditions, optionally within a user scope. */
export async function matchRule(
  rule: Pick<AlertRule, "conditions">,
  opts: { scope?: string[] | null; limit?: number } = {}
): Promise<{ total: number; matches: RuleMatch[] }> {
  const params: unknown[] = [];
  let scopeSql = "";
  if (opts.scope) {
    params.push(opts.scope);
    scopeSql = "f.user_id = ANY($1::text[]) AND ";
  }
  const compiled = compileConditions(rule.conditions, params);
  const where = `${scopeSql}${compiled.sql}`;
  const limitSql = opts.limit ? `LIMIT ${Math.max(1, Math.min(1000, Math.floor(opts.limit)))}` : "";

  const pool = getPool();
  const [{ rows }, count] = await Promise.all([
    pool.query<RuleMatch>(
      `SELECT f.user_id, f.name, f.pql_score, f.priority, f.priority_trigger, ps.priority_reason, f.next_best_action,
              f.auto_apply_used, f.lifecycle_stage, f.has_open_lead
       FROM v_user_facts f LEFT JOIN pql_scores ps ON ps.user_id = f.user_id
       WHERE ${where}
       ORDER BY f.pql_score DESC, f.user_id
       ${limitSql}`,
      compiled.params
    ),
    opts.limit
      ? pool.query<{ n: string }>(`SELECT count(*) AS n FROM v_user_facts f WHERE ${where}`, compiled.params)
      : null,
  ]);
  return { total: count ? Number(count.rows[0]!.n) : rows.length, matches: rows };
}

const alertKey = (rule: AlertRule, userId: string, now: Date) => {
  const windowMs = Math.max(1, rule.cooldown_hours) * 3_600_000;
  return `${rule.id}:${userId}:${Math.floor(now.getTime() / windowMs)}`;
};

export interface ActionTally {
  alerts_created: number;
  alerts_suppressed: number;
  leads_created: number;
  leads_escalated: number;
  leads_unchanged: number;
  leads_suppressed: number;
  communications_skipped: number;
}

const emptyTally = (): ActionTally => ({
  alerts_created: 0,
  alerts_suppressed: 0,
  leads_created: 0,
  leads_escalated: 0,
  leads_unchanged: 0,
  leads_suppressed: 0,
  communications_skipped: 0,
});

/** Execute a rule's actions for its matches (live mode). */
export async function executeRuleActions(q: Queryable, rule: AlertRule, matches: RuleMatch[], now = new Date()) {
  const tally = emptyTally();
  for (const m of matches) {
    for (const action of rule.actions) {
      if (action.type === "create_alert") {
        const { rows } = await q.query<{ id: string }>(
          `INSERT INTO alerts (rule_id, rule_version, user_id, priority, category, owner_team, title, reason,
                               idempotency_key, sla_due_at, context)
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(mins => $10), $11
           WHERE NOT EXISTS (
             SELECT 1 FROM alerts a
             WHERE a.rule_id = $1 AND a.user_id = $3
               AND (a.status <> 'resolved' OR a.created_at > now() - make_interval(hours => $12))
           )
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [
            rule.id,
            rule.version,
            m.user_id,
            rule.priority,
            rule.category,
            rule.owner_team,
            rule.name,
            m.priority_reason ?? rule.description,
            alertKey(rule, m.user_id, now),
            rule.sla_minutes,
            JSON.stringify({
              source: "rule",
              pql_score: m.pql_score,
              auto_apply_used: m.auto_apply_used,
              lifecycle_stage: m.lifecycle_stage,
            }),
            rule.cooldown_hours,
          ]
        );
        if (rows[0]) tally.alerts_created++;
        else tally.alerts_suppressed++;
      } else if (action.type === "create_lead") {
        const r = await upsertRuleLead(q, {
          userId: m.user_id,
          priority: m.priority ?? rule.priority,
          reason: m.priority_reason ?? rule.name,
          reasonCode: m.priority_trigger ?? rule.id,
          ruleId: rule.id,
          source: "rule",
          slaMinutes: rule.sla_minutes,
          nextAction: m.next_best_action,
        });
        if (r.outcome === "created") tally.leads_created++;
        else if (r.outcome === "escalated") tally.leads_escalated++;
        else if (r.outcome === "suppressed") tally.leads_suppressed++;
        else tally.leads_unchanged++;
      } else if (COMMUNICATION_ACTIONS.has(action.type)) {
        tally.communications_skipped++;
      }
    }
  }
  return tally;
}

/** What a rule would do, with no writes to alerts/leads and no communications. */
export async function previewRuleActions(rule: AlertRule, matches: RuleMatch[]) {
  const pool = getPool();
  const userIds = matches.map((m) => m.user_id);
  const [openAlerts, suppressed] = await Promise.all([
    pool.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM alerts
       WHERE rule_id = $1 AND user_id = ANY($2::text[])
         AND (status <> 'resolved' OR created_at > now() - make_interval(hours => $3))`,
      [rule.id, userIds, rule.cooldown_hours]
    ),
    pool.query<{ user_id: string }>(
      "SELECT DISTINCT user_id FROM sales_leads WHERE user_id = ANY($1::text[]) AND suppressed_until > now()",
      [userIds]
    ),
  ]);
  const alerted = new Set(openAlerts.rows.map((r) => r.user_id));
  const suppressedSet = new Set(suppressed.rows.map((r) => r.user_id));

  return matches.map((m) => ({
    user_id: m.user_id,
    name: m.name,
    pql_score: m.pql_score,
    actions: rule.actions.map((a) => {
      if (a.type === "create_alert") {
        return { type: a.type, would: alerted.has(m.user_id) ? "skip (open alert or cooldown)" : "create" };
      }
      if (a.type === "create_lead") {
        if (suppressedSet.has(m.user_id)) return { type: a.type, would: "skip (suppressed)" };
        return { type: a.type, would: m.has_open_lead ? "escalate if more urgent" : "create" };
      }
      if (COMMUNICATION_ACTIONS.has(a.type)) return { type: a.type, would: "not sent (test mode)" };
      return { type: a.type, would: "unsupported" };
    }),
  }));
}

/**
 * Close rule-generated alerts whose condition no longer holds (e.g. the user paid,
 * or their routing trigger moved on). Manually raised alerts (context.source <> 'rule')
 * are never auto-resolved. `scope` limits this to users that were re-evaluated.
 */
export async function autoResolveStaleAlerts(q: Queryable, rule: AlertRule, matchedUserIds: string[], scope: string[] | null) {
  const { rows } = await q.query<{ id: string }>(
    `UPDATE alerts SET status = 'resolved', resolved_at = now(), resolved_by = 'system',
            resolution = 'auto_resolved: rule condition no longer met'
     WHERE rule_id = $1 AND status <> 'resolved' AND context->>'source' = 'rule'
       AND NOT (user_id = ANY($2::text[]))
       AND ($3::text[] IS NULL OR user_id = ANY($3::text[]))
     RETURNING id`,
    [rule.id, matchedUserIds, scope]
  );
  return rows.map((r) => r.id);
}
