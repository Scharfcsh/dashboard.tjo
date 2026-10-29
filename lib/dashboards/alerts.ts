import { z } from "zod";
import { audit } from "@/lib/audit";
import { matchRule, previewRuleActions, SUPPORTED_ACTIONS, type AlertRule } from "@/lib/automation/evaluate";
import { getPool, queryOne, queryRows, withTransaction } from "@/lib/db/pool";
import { ApiError, notFound } from "@/lib/http/errors";
import { compileConditions } from "@/lib/segments/conditions";
import { withUserDetails } from "@/lib/user-details";

// Dashboard 8 - Revenue Alerts & Automation Center (SOP section 15).

export const ALERT_CATEGORIES = ["revenue", "usage", "retention", "sales", "product", "support"] as const;

export async function listAlerts(
  filters: { status: "open" | "acknowledged" | "resolved" | "unresolved" | "all"; priority?: string; team?: string; ruleId?: string; userId?: string; overdue?: boolean },
  page: { limit: number; offset: number }
) {
  const p: unknown[] = [];
  let where = "WHERE true";
  if (filters.status === "unresolved") where += " AND a.status <> 'resolved'";
  else if (filters.status !== "all") {
    p.push(filters.status);
    where += ` AND a.status = $${p.length}`;
  }
  for (const [col, v] of [
    ["a.priority", filters.priority],
    ["a.owner_team", filters.team],
    ["a.rule_id", filters.ruleId],
    ["a.user_id", filters.userId],
  ] as const) {
    if (v) {
      p.push(v);
      where += ` AND ${col} = $${p.length}`;
    }
  }
  if (filters.overdue) where += " AND a.status <> 'resolved' AND a.sla_due_at < now()";

  const [rows, total, cards] = await Promise.all([
    queryRows(
      `SELECT a.id, a.rule_id, r.name AS rule_name, a.rule_version, a.title, a.reason, a.priority, a.category, a.owner_team,
              a.owner_id, tm.name AS owner_name, a.status, a.user_id, u.name AS user_name, a.sla_due_at,
              (a.status <> 'resolved' AND a.sla_due_at < now()) AS sla_breached, a.context, a.created_at, a.resolved_at,
              a.resolved_by, a.resolution
       FROM alerts a
       JOIN alert_rules r ON r.id = a.rule_id
       LEFT JOIN users u ON u.user_id = a.user_id
       LEFT JOIN team_members tm ON tm.id = a.owner_id
       ${where}
       ORDER BY (a.status = 'resolved'), a.priority, a.created_at DESC, a.id
       LIMIT ${page.limit} OFFSET ${page.offset}`,
      p
    ),
    queryOne<{ n: number }>(`SELECT count(*) AS n FROM alerts a ${where}`, p),
    queryOne<Record<string, unknown>>(
      `SELECT count(*) FILTER (WHERE status <> 'resolved')                                     AS open,
              count(*) FILTER (WHERE status <> 'resolved' AND priority = 'P0')                 AS open_p0,
              count(*) FILTER (WHERE status <> 'resolved' AND sla_due_at < now())              AS overdue_sla,
              count(*) FILTER (WHERE resolved_at >= business_day_start(business_today()))      AS resolved_today,
              (SELECT count(*) FROM alert_rules WHERE status = 'active')                        AS rules_active,
              (SELECT count(*) FROM automation_runs WHERE mode = 'live'
                 AND started_at >= business_day_start(business_today()))                        AS automation_runs_today,
              (SELECT jsonb_object_agg(category, n) FROM (
                 SELECT category, count(*) AS n FROM alerts WHERE status <> 'resolved' GROUP BY category) c) AS open_by_category,
              round(100.0 * count(*) FILTER (WHERE resolved_by = 'system' AND resolved_at >= business_day_start(business_today()))
                    / NULLIF(count(*) FILTER (WHERE resolved_at >= business_day_start(business_today())), 0), 1)::float8 AS resolved_automatically_today_pct,
              round(100.0 * count(*) FILTER (WHERE priority = 'P0' AND status = 'resolved' AND resolved_at <= sla_due_at)
                    / NULLIF(count(*) FILTER (WHERE priority = 'P0' AND status = 'resolved'), 0), 1)::float8 AS p0_resolved_within_sla_pct
       FROM alerts`
    ),
  ]);
  const data = await withUserDetails(rows, { name: "user_name", email: null, phone: null });
  return { data, total: total?.n ?? 0, summary: cards };
}

export async function resolveAlert(alertId: string, actor: string, resolution: string) {
  return withTransaction(async (client) => {
    const { rows } = await client.query("SELECT id, status, rule_id, user_id FROM alerts WHERE id = $1 FOR UPDATE", [alertId]);
    const alert = rows[0];
    if (!alert) throw notFound("Alert");
    if (alert.status === "resolved") throw new ApiError("INVALID_STATE", "Alert is already resolved");
    const { rows: updated } = await client.query(
      `UPDATE alerts SET status = 'resolved', resolved_at = now(), resolved_by = $2, resolution = $3 WHERE id = $1 RETURNING *`,
      [alertId, actor, resolution]
    );
    await audit(
      { actorId: actor, action: "alert.resolved", entityType: "alert", entityId: alertId, before: { status: alert.status }, after: { status: "resolved", resolution } },
      client
    );
    return updated[0];
  });
}

// --------------------------------------------------------------------------- rules

export const ruleInputSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_]{2,62}$/, "id must be 3-63 chars of a-z, 0-9, _")
      .optional(),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    category: z.enum(ALERT_CATEGORIES),
    conditions: z.unknown(),
    actions: z
      .array(z.object({ type: z.enum(SUPPORTED_ACTIONS) }).catchall(z.unknown()))
      .min(1)
      .max(10),
    priority: z.enum(["P0", "P1", "P2"]),
    owner_team: z.string().trim().min(1).max(50),
    sla_minutes: z.number().int().min(1).max(60 * 24 * 30),
    cooldown_hours: z.number().int().min(1).max(24 * 90).default(24),
  })
  .strict();

export async function listRules(status?: string) {
  const p: unknown[] = [];
  let where = "";
  if (status) {
    p.push(status);
    where = "WHERE r.status = $1";
  }
  return queryRows(
    `SELECT r.*,
            s.runs_7d, s.matched_7d, s.alerts_created_7d, s.leads_created_7d, s.failed_runs_7d, s.last_run_at,
            t.last_test_at,
            (SELECT count(*) FROM alerts a WHERE a.rule_id = r.id AND a.status <> 'resolved') AS open_alerts
     FROM alert_rules r
     LEFT JOIN LATERAL (
       SELECT count(*) AS runs_7d,
              COALESCE(sum(matched_count), 0) AS matched_7d,
              COALESCE(sum((actions_result->>'alerts_created')::int), 0) AS alerts_created_7d,
              COALESCE(sum((actions_result->>'leads_created')::int), 0) AS leads_created_7d,
              count(*) FILTER (WHERE status = 'failed') AS failed_runs_7d,
              max(started_at) AS last_run_at
       FROM automation_runs WHERE rule_id = r.id AND mode = 'live' AND started_at > now() - interval '7 days'
     ) s ON true
     LEFT JOIN LATERAL (SELECT max(started_at) AS last_test_at FROM automation_runs WHERE rule_id = r.id AND mode = 'test') t ON true
     ${where}
     ORDER BY (r.status = 'active') DESC, r.priority, r.id`,
    p
  );
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50) || "rule";

/**
 * Create a draft rule, or save a new version of an existing custom rule. Any
 * edit puts the rule back in draft - it must be tested and re-activated.
 * Built-in rules (SOP 5.3 routing) cannot be edited.
 */
export async function saveRule(input: z.infer<typeof ruleInputSchema>, actor: string | null) {
  compileConditions(input.conditions); // validate (throws 400 with a path)

  return withTransaction(async (client) => {
    const id = input.id ?? `${slug(input.name)}_${Math.random().toString(36).slice(2, 7)}`;
    const existing = (await client.query<AlertRule & { is_builtin: boolean }>("SELECT * FROM alert_rules WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (existing?.is_builtin) throw new ApiError("INVALID_STATE", "Built-in routing rules cannot be edited");

    const values = [
      id,
      input.name,
      input.description ?? null,
      input.category,
      JSON.stringify(input.conditions),
      JSON.stringify(input.actions),
      input.priority,
      input.owner_team,
      input.sla_minutes,
      input.cooldown_hours,
      actor,
    ];
    const { rows } = existing
      ? await client.query(
          `UPDATE alert_rules SET name = $2, description = $3, category = $4, conditions = $5, actions = $6, priority = $7,
                  owner_team = $8, sla_minutes = $9, cooldown_hours = $10, status = 'draft', version = version + 1,
                  updated_at = now(), activated_at = NULL
           WHERE id = $1 RETURNING *`,
          values.slice(0, 10)
        )
      : await client.query(
          `INSERT INTO alert_rules (id, name, description, category, conditions, actions, priority, owner_team, sla_minutes,
                                    cooldown_hours, created_by, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft') RETURNING *`,
          values
        );
    await audit(
      { actorId: actor, action: existing ? "rule.updated" : "rule.created", entityType: "alert_rule", entityId: id, before: existing ?? undefined, after: rows[0] },
      client
    );
    return { rule: rows[0], created: !existing };
  });
}

async function getRule(ruleId: string): Promise<AlertRule & { is_builtin: boolean }> {
  const rule = await queryOne<AlertRule & { is_builtin: boolean }>("SELECT * FROM alert_rules WHERE id = $1", [ruleId]);
  if (!rule) throw notFound("Rule");
  return rule;
}

/** Dry run: who matches and what would happen. Writes only an automation_runs(mode=test) row. Sends nothing. */
export async function testRule(ruleId: string, actor: string | null, sampleSize: number) {
  const rule = await getRule(ruleId);
  const startedAt = new Date();
  const { total, matches } = await matchRule(rule, { limit: sampleSize });
  const preview = await previewRuleActions(rule, matches);
  const wouldCreateAlerts = preview.filter((p) => p.actions.some((a) => a.type === "create_alert" && a.would === "create")).length;

  const run = await queryOne<{ id: string }>(
    `INSERT INTO automation_runs (rule_id, rule_version, mode, status, matched_count, actions_result, triggered_by, started_at, finished_at)
     VALUES ($1, $2, 'test', 'success', $3, $4, $5, $6, now()) RETURNING id`,
    [rule.id, rule.version, total, JSON.stringify({ sample_size: matches.length, sample_would_create_alerts: wouldCreateAlerts, communications_sent: 0 }), actor ?? "test", startedAt]
  );
  await audit({ actorId: actor, action: "rule.tested", entityType: "alert_rule", entityId: rule.id, metadata: { run_id: run?.id, matched: total } });
  return {
    run_id: run?.id,
    rule: { id: rule.id, version: rule.version, status: rule.status },
    matched_users: total,
    sample: preview,
    communications_sent: 0,
    note: "Test mode: no alerts, leads or messages were created or sent.",
  };
}

export async function activateRule(ruleId: string, actor: string | null) {
  const rule = await getRule(ruleId);
  compileConditions(rule.conditions);
  if (rule.status === "active") return { rule, changed: false };
  const tested = await queryOne(
    "SELECT 1 FROM automation_runs WHERE rule_id = $1 AND rule_version = $2 AND mode = 'test' AND status = 'success'",
    [rule.id, rule.version]
  );
  if (!tested && !rule.is_builtin) {
    throw new ApiError("INVALID_STATE", "Run POST /api/automation-rules/:ruleId/test on this version before activating");
  }
  const { rows } = await getPool().query(
    "UPDATE alert_rules SET status = 'active', activated_at = now(), updated_at = now() WHERE id = $1 RETURNING *",
    [ruleId]
  );
  await audit({ actorId: actor, action: "rule.activated", entityType: "alert_rule", entityId: ruleId, before: { status: rule.status }, after: { status: "active", version: rule.version } });
  return { rule: rows[0], changed: true };
}
