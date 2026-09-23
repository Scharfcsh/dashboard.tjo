import type { PoolClient } from "pg";
import { audit } from "@/lib/audit";
import { getPool, type Queryable } from "@/lib/db/pool";
import { ApiError } from "@/lib/http/errors";
import { OPEN_LEAD_SQL } from "@/lib/jobs/sql";

// ---------------------------------------------------------------------------
// Lead creation and ownership - shared by the rule engine, POST /api/live/assign
// and auto-assignment, so "one open lead per user" and assignment history are
// enforced in exactly one place.
// ---------------------------------------------------------------------------

export type LeadPriority = "P0" | "P1" | "P2";

/** SLA per priority when a caller creates a lead by hand (rules carry their own). */
export const MANUAL_SLA_MINUTES: Record<LeadPriority, number> = { P0: 15, P1: 480, P2: 4320 };

export interface LeadRow {
  id: string;
  user_id: string;
  status: string;
  priority: LeadPriority;
  owner_id: string | null;
}

export async function findOpenLead(q: Queryable, userId: string): Promise<LeadRow | null> {
  const { rows } = await q.query<LeadRow>(
    `SELECT id, user_id, status, priority, owner_id FROM sales_leads WHERE user_id = $1 AND status IN ${OPEN_LEAD_SQL}`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function isSuppressed(q: Queryable, userId: string): Promise<boolean> {
  const { rows } = await q.query("SELECT 1 FROM sales_leads WHERE user_id = $1 AND suppressed_until > now() LIMIT 1", [
    userId,
  ]);
  return rows.length > 0;
}

/**
 * Create an open lead unless one exists (the partial unique index settles races)
 * or the user is inside a suppression window. When an open lead exists and the
 * new signal is more urgent, the lead is escalated instead.
 */
export async function upsertRuleLead(
  q: Queryable,
  input: {
    userId: string;
    priority: LeadPriority;
    reason: string;
    reasonCode: string | null;
    ruleId: string | null;
    source: "rule" | "manual";
    slaMinutes: number;
    nextAction: string | null;
  }
): Promise<{ outcome: "created" | "escalated" | "unchanged" | "suppressed"; leadId: string | null }> {
  if (await isSuppressed(q, input.userId)) return { outcome: "suppressed", leadId: null };

  const inserted = await q.query<{ id: string }>(
    `INSERT INTO sales_leads (user_id, priority, reason, reason_code, source, rule_id, next_action, next_action_at, sla_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now() + make_interval(mins => $8))
     ON CONFLICT (user_id) WHERE status IN ${OPEN_LEAD_SQL} DO NOTHING
     RETURNING id`,
    [input.userId, input.priority, input.reason, input.reasonCode, input.source, input.ruleId, input.nextAction, input.slaMinutes]
  );
  if (inserted.rows[0]) {
    await audit(
      {
        actorId: input.source === "rule" ? "system" : null,
        action: "lead.created",
        entityType: "sales_lead",
        entityId: inserted.rows[0].id,
        after: input,
      },
      q
    );
    return { outcome: "created", leadId: inserted.rows[0].id };
  }

  // 'P0' < 'P1' < 'P2' lexically, so "more urgent" is a string comparison.
  const escalated = await q.query<{ id: string }>(
    `UPDATE sales_leads
     SET priority = $2, reason = $3, reason_code = $4, rule_id = COALESCE($5, rule_id),
         sla_due_at = LEAST(sla_due_at, now() + make_interval(mins => $6)), next_action = COALESCE($7, next_action),
         updated_at = now()
     WHERE user_id = $1 AND status IN ${OPEN_LEAD_SQL} AND priority > $2
     RETURNING id`,
    [input.userId, input.priority, input.reason, input.reasonCode, input.ruleId, input.slaMinutes, input.nextAction]
  );
  if (escalated.rows[0]) return { outcome: "escalated", leadId: escalated.rows[0].id };
  return { outcome: "unchanged", leadId: null };
}

export async function assertTeamMember(q: Queryable, id: string): Promise<{ id: string; name: string; active: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("VALIDATION_FAILED", "owner_id must be a team member UUID");
  const { rows } = await q.query<{ id: string; name: string; active: boolean }>(
    "SELECT id, name, active FROM team_members WHERE id = $1",
    [id]
  );
  if (!rows[0]) throw new ApiError("NOT_FOUND", "Team member not found");
  if (!rows[0].active) throw new ApiError("INVALID_STATE", "Team member is inactive");
  return rows[0];
}

/** Set a lead's owner and record the change in sales_assignments + audit_logs. */
export async function assignLead(
  client: PoolClient,
  input: { leadId: string; toOwnerId: string; assignedBy: string | null; reason: string | null }
): Promise<{ changed: boolean; fromOwnerId: string | null }> {
  const { rows } = await client.query<{ owner_id: string | null; user_id: string }>(
    "SELECT owner_id, user_id FROM sales_leads WHERE id = $1 FOR UPDATE",
    [input.leadId]
  );
  const lead = rows[0];
  if (!lead) throw new ApiError("NOT_FOUND", "Lead not found");
  if (lead.owner_id === input.toOwnerId) return { changed: false, fromOwnerId: lead.owner_id };

  await client.query("UPDATE sales_leads SET owner_id = $2, updated_at = now() WHERE id = $1", [
    input.leadId,
    input.toOwnerId,
  ]);
  await client.query(
    `INSERT INTO sales_assignments (lead_id, user_id, from_owner_id, to_owner_id, assigned_by, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.leadId, lead.user_id, lead.owner_id, input.toOwnerId, input.assignedBy, input.reason]
  );
  await audit(
    {
      actorId: input.assignedBy,
      action: lead.owner_id ? "lead.reassigned" : "lead.assigned",
      entityType: "sales_lead",
      entityId: input.leadId,
      before: { owner_id: lead.owner_id },
      after: { owner_id: input.toOwnerId },
      metadata: { reason: input.reason, user_id: lead.user_id },
    },
    client
  );
  return { changed: true, fromOwnerId: lead.owner_id };
}

/**
 * Weighted round-robin: each unassigned open lead (most urgent first) goes to
 * the active caller with the most spare capacity. Runs inside the pipeline lock.
 */
export async function autoAssignLeads(): Promise<number> {
  const pool = getPool();
  const leads = (
    await pool.query<{ id: string }>(
      `SELECT id FROM sales_leads WHERE owner_id IS NULL AND status IN ${OPEN_LEAD_SQL}
       ORDER BY priority, created_at LIMIT 500`
    )
  ).rows;
  if (leads.length === 0) return 0;

  const callers = (
    await pool.query<{ id: string; capacity: number; load: string }>(
      `SELECT tm.id, tm.capacity, count(l.id) AS load
       FROM team_members tm
       LEFT JOIN sales_leads l ON l.owner_id = tm.id AND l.status IN ${OPEN_LEAD_SQL}
       WHERE tm.active AND tm.role = 'caller'
       GROUP BY tm.id, tm.capacity`
    )
  ).rows.map((c) => ({ id: c.id, capacity: c.capacity, load: Number(c.load) }));
  if (callers.length === 0) return 0;

  let assigned = 0;
  for (const lead of leads) {
    callers.sort((a, b) => a.load / a.capacity - b.load / b.capacity);
    const target = callers[0]!;
    if (target.load >= target.capacity) break;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await assignLead(client, { leadId: lead.id, toOwnerId: target.id, assignedBy: "system:auto-assign", reason: "round_robin" });
      await client.query("COMMIT");
      if (r.changed) {
        target.load += 1;
        assigned += 1;
      }
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  return assigned;
}
