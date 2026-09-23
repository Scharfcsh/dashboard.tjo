import { queryRows } from "@/lib/db/pool";

export interface AlertGroupRow {
  rule_id: string;
  rule_name: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  users: number;
  alerts: number;
  latest_at: Date;
}

/** Open (unresolved) alerts grouped by rule - "5 users reached 50/50 ..." lines. */
export async function openAlertGroups(): Promise<AlertGroupRow[]> {
  return queryRows<AlertGroupRow>(
    `SELECT a.rule_id, r.name AS rule_name, min(a.priority) AS priority, min(a.category) AS category,
            count(DISTINCT a.user_id)::int AS users, count(*)::int AS alerts, max(a.created_at) AS latest_at
     FROM alerts a JOIN alert_rules r ON r.id = a.rule_id
     WHERE a.status <> 'resolved'
     GROUP BY a.rule_id, r.name
     ORDER BY min(a.priority), max(a.created_at) DESC`
  );
}
