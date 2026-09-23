import type { Queryable } from "@/lib/db/pool";
import { getPool } from "@/lib/db/pool";

// Sensitive admin actions (SOP 17.3): assignment, dispositions, notes, alert
// resolution, rule changes, PII reveals. Append-only.

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry, q: Queryable = getPool()): Promise<void> {
  await q.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before, after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorId ?? "unknown",
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      JSON.stringify(entry.metadata ?? {}),
    ]
  );
}
