"use server";

import { z } from "zod";
import { audit } from "@/lib/audit";
import { canWriteAudit, sessionRefusal, writeRefusal } from "@/lib/auth/guard";
import { queryOne } from "@/lib/db/pool";
import { DISPOSITIONS, logActivity, scheduleCallback, setDisposition } from "@/lib/dashboards/sales";
import { ApiError } from "@/lib/http/errors";
import { autoAssignLeads } from "@/lib/sales/leads";
import { isManagerRole } from "@/lib/sales-crm/derive";
import { withUserDetails } from "@/lib/user-details";
import type { ActionResult } from "@/lib/revenue-center/types";

// Server Functions for the Sales Caller CRM.
//
// Unlike the other dashboards, these log work under the *selected caller's*
// team-member id rather than a shared "dashboard:admin" string, so the
// leaderboard and audit trail name a real person.
//
// Signing in proves access to the dashboard, not which team member is calling:
// the caller id is still taken from the page's caller switcher.

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError || err instanceof z.ZodError) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Invalid input" };
  }
  console.error("[sales-crm action]", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const uuid = z.uuid();

/** Every action names the acting team member, and they must exist. */
async function requireCaller(callerId: string): Promise<{ id: string; name: string; role: string }> {
  const id = uuid.parse(callerId);
  const member = await queryOne<{ id: string; name: string; role: string }>(
    "SELECT id, name, role FROM team_members WHERE id = $1",
    [id]
  );
  if (!member) throw new ApiError("NOT_FOUND", "Team member not found");
  return member;
}


export async function logContactAction(
  leadId: string,
  callerId: string,
  input: { type: "call" | "whatsapp" | "email"; outcome?: string; durationSeconds?: number },
  demo: boolean
): Promise<ActionResult<{ dispositionRequired: boolean }>> {
  const stop = await writeRefusal("Logging contact", demo);
  if (stop) return stop;
  try {
    const caller = await requireCaller(callerId);
    const parsed = z
      .object({
        type: z.enum(["call", "whatsapp", "email"]),
        outcome: z.string().max(40).optional(),
        durationSeconds: z.number().int().min(0).max(86_400).optional(),
      })
      .parse(input);
    const result = await logActivity(uuid.parse(leadId), caller.id, {
      type: parsed.type,
      outcome: parsed.outcome,
      duration_seconds: parsed.durationSeconds,
    });
    return { ok: true, data: { dispositionRequired: result.disposition_required } };
  } catch (err) {
    return failure(err);
  }
}

export async function addNoteAction(
  leadId: string,
  callerId: string,
  body: string,
  demo: boolean
): Promise<ActionResult<{ saved: true }>> {
  const stop = await writeRefusal("Adding notes", demo);
  if (stop) return stop;
  try {
    const caller = await requireCaller(callerId);
    const text = z.string().trim().min(1).max(10_000).parse(body);
    await logActivity(uuid.parse(leadId), caller.id, { type: "note", body: text });
    return { ok: true, data: { saved: true } };
  } catch (err) {
    return failure(err);
  }
}

const dispositionSchema = z.object({
  disposition: z.enum(DISPOSITIONS),
  notes: z.string().trim().max(10_000).optional(),
  callbackAt: z.string().optional(),
  objection: z.string().trim().max(200).optional(),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  recommendedPlan: z.string().trim().max(40).optional(),
});

/**
 * Completes a call: records the duration against the call, then sets the
 * outcome. The disposition drives everything downstream (callbacks, the support
 * handoff alert, suppression, closing the lead) - this only passes it through.
 */
export async function setDispositionAction(
  leadId: string,
  callerId: string,
  input: unknown,
  demo: boolean
): Promise<ActionResult<{ status: string; closed: boolean }>> {
  const stop = await writeRefusal("Setting an outcome", demo);
  if (stop) return stop;
  try {
    const caller = await requireCaller(callerId);
    const q = dispositionSchema.parse(input);
    const id = uuid.parse(leadId);

    if (q.durationSeconds !== undefined && q.durationSeconds > 0) {
      await logActivity(id, caller.id, { type: "call", outcome: "connected", duration_seconds: q.durationSeconds });
    }

    const notes = [q.notes, q.recommendedPlan ? `Recommended plan: ${q.recommendedPlan}` : null]
      .filter(Boolean)
      .join("\n");

    const result = await setDisposition(id, caller.id, {
      disposition: q.disposition,
      notes: notes || undefined,
      callback_at: q.callbackAt,
      objection: q.objection,
    });
    const status = String((result.lead as { status: string }).status);
    return { ok: true, data: { status, closed: status === "converted" || status === "lost" } };
  } catch (err) {
    return failure(err);
  }
}

export async function scheduleCallbackAction(
  leadId: string,
  callerId: string,
  dueAt: string,
  notes: string,
  demo: boolean
): Promise<ActionResult<{ dueAt: string }>> {
  const stop = await writeRefusal("Scheduling callbacks", demo);
  if (stop) return stop;
  try {
    const caller = await requireCaller(callerId);
    const when = z.iso.datetime({ offset: true }).parse(dueAt);
    const row = await scheduleCallback(uuid.parse(leadId), caller.id, {
      due_at: when,
      notes: notes.trim() || undefined,
    });
    return { ok: true, data: { dueAt: (row as { due_at: Date }).due_at.toISOString() } };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Hands the caller the real phone number and email so they can dial. The page
 * only ever holds masked values, so this is the single audited moment where
 * contact details are released (SOP 17.2).
 */
export async function revealContactAction(
  leadId: string,
  callerId: string,
  demo: boolean
): Promise<ActionResult<{ phone: string | null; email: string | null; name: string }>> {
  const signedOut = await sessionRefusal();
  if (signedOut) return signedOut;
  if (demo) return { ok: false, error: "Revealing contact details is disabled while showing demo data." };
  try {
    const caller = await requireCaller(callerId);
    const found = await queryOne<{ user_id: string; name: string | null; phone: string | null; email: string | null }>(
      `SELECT u.user_id, u.name, u.phone, u.email
       FROM sales_leads l JOIN users u ON u.user_id = l.user_id WHERE l.id = $1`,
      [uuid.parse(leadId)]
    );
    if (!found) throw new ApiError("NOT_FOUND", "Lead not found");
    const row = (await withUserDetails([found]))[0]!;
    // The audit row cannot be written on a read-only connection.
    if (canWriteAudit()) {
      await audit({
        actorId: caller.id,
        action: "pii.revealed",
        entityType: "user",
        entityId: row.user_id,
        metadata: { endpoint: "/sales-crm", lead_id: leadId, fields: ["phone", "email"] },
      });
    }
    return { ok: true, data: { phone: row.phone, email: row.email, name: row.name ?? row.user_id } };
  } catch (err) {
    return failure(err);
  }
}

/** Manager only: fill the callers' queues from the unassigned pool. */
export async function runRoundRobinAction(
  callerId: string,
  demo: boolean
): Promise<ActionResult<{ assigned: number }>> {
  const stop = await writeRefusal("Assigning leads", demo);
  if (stop) return stop;
  try {
    const caller = await requireCaller(callerId);
    if (!isManagerRole(caller.role)) {
      return { ok: false, error: "Only a sales manager can assign the unassigned pool." };
    }
    return { ok: true, data: { assigned: await autoAssignLeads() } };
  } catch (err) {
    return failure(err);
  }
}
