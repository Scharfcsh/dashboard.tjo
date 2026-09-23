import { getConfig } from "@/lib/config";
import { audit } from "@/lib/audit";
import { getPool, withTransaction } from "@/lib/db/pool";
import { autoResolveStaleAlerts, executeRuleActions, matchRule, type AlertRule } from "@/lib/automation/evaluate";
import { OPEN_LEAD_SQL } from "@/lib/jobs/sql";
import { autoAssignLeads } from "@/lib/sales/leads";

export interface AlertStats {
  rules_evaluated: number;
  matches: number;
  alerts_created: number;
  leads_created: number;
  leads_escalated: number;
  leads_converted: number;
  leads_auto_assigned: number;
  alerts_auto_resolved: number;
}

/**
 * Evaluate active rules for `scope` users (null = everyone), close leads for
 * users who became paid, then optionally auto-assign new leads.
 */
export async function evaluateAlerts(scope: string[] | null, now = new Date()): Promise<AlertStats> {
  const stats: AlertStats = {
    rules_evaluated: 0,
    matches: 0,
    alerts_created: 0,
    leads_created: 0,
    leads_escalated: 0,
    leads_converted: 0,
    leads_auto_assigned: 0,
    alerts_auto_resolved: 0,
  };
  if (scope && scope.length === 0) return stats;
  const pool = getPool();

  // Conversion closes the lead and stops free-user outreach (SOP 6.3 "Converted").
  // Only money that arrived after the lead was opened counts: a paying user with
  // a failed renewal is already "paid" and must keep their recovery lead. "After"
  // is by occurrence OR by receipt, so a late-delivered webhook still converts.
  const converted = await pool.query<{ id: string; user_id: string }>(
    `UPDATE sales_leads l SET status = 'converted', closed_at = now(), updated_at = now(),
            last_disposition = COALESCE(l.last_disposition, 'converted'), next_action = NULL
     WHERE l.status IN ${OPEN_LEAD_SQL}
       AND ($1::text[] IS NULL OR l.user_id = ANY($1::text[]))
       AND EXISTS (SELECT 1 FROM payment_events p JOIN user_events e ON e.event_id = p.event_id
                   WHERE p.user_id = l.user_id AND p.status = 'success'
                     AND (p.occurred_at > l.created_at OR e.received_at > l.created_at))
     RETURNING l.id, l.user_id`,
    [scope]
  );
  for (const lead of converted.rows) {
    await audit({
      actorId: "system",
      action: "lead.converted",
      entityType: "sales_lead",
      entityId: lead.id,
      metadata: { user_id: lead.user_id, via: "subscription_active" },
    });
  }
  stats.leads_converted = converted.rowCount ?? 0;

  const rules = (await pool.query<AlertRule>("SELECT * FROM alert_rules WHERE status = 'active' ORDER BY priority, id")).rows;
  for (const rule of rules) {
    stats.rules_evaluated++;
    const startedAt = new Date();
    try {
      const { matches } = await matchRule(rule, { scope });
      const resolved = await autoResolveStaleAlerts(pool, rule, matches.map((m) => m.user_id), scope);
      if (resolved.length > 0) {
        stats.alerts_auto_resolved += resolved.length;
        await audit({
          actorId: "system",
          action: "alert.auto_resolved",
          entityType: "alert_rule",
          entityId: rule.id,
          metadata: { alert_ids: resolved },
        });
      }
      if (matches.length === 0) continue;
      stats.matches += matches.length;

      const tally = await withTransaction((client) => executeRuleActions(client, rule, matches, now));
      stats.alerts_created += tally.alerts_created;
      stats.leads_created += tally.leads_created;
      stats.leads_escalated += tally.leads_escalated;

      await pool.query(
        `INSERT INTO automation_runs (rule_id, rule_version, mode, status, matched_count, actions_result, triggered_by,
                                      started_at, finished_at)
         VALUES ($1, $2, 'live', 'success', $3, $4, 'pipeline', $5, now())`,
        [rule.id, rule.version, matches.length, JSON.stringify(tally), startedAt]
      );
    } catch (err) {
      console.error(`[alerts] rule ${rule.id} failed`, err);
      await pool.query(
        `INSERT INTO automation_runs (rule_id, rule_version, mode, status, error, triggered_by, started_at, finished_at)
         VALUES ($1, $2, 'live', 'failed', $3, 'pipeline', $4, now())`,
        [rule.id, rule.version, err instanceof Error ? err.message : String(err), startedAt]
      );
    }
  }

  if (getConfig().AUTO_ASSIGN_LEADS) stats.leads_auto_assigned = await autoAssignLeads();
  return stats;
}
