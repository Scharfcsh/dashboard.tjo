"use server";

import { z } from "zod";
import { audit } from "@/lib/audit";
import { canWriteAudit, sessionRefusal, writeRefusal } from "@/lib/auth/guard";
import { queryOne, withTransaction } from "@/lib/db/pool";
import { assignUser } from "@/lib/dashboards/live";
import { logActivity, scheduleCallback } from "@/lib/dashboards/sales";
import { assertUserExists } from "@/lib/dashboards/user360";
import { ApiError } from "@/lib/http/errors";
import { MANUAL_SLA_MINUTES, findOpenLead, upsertRuleLead, type LeadPriority } from "@/lib/sales/leads";
import { withUserDetails } from "@/lib/user-details";
import { loadRawEvents } from "@/lib/user-360/queries";
import type { ActionResult } from "@/lib/revenue-center/types";
import type { RawEventRow } from "@/lib/user-360/types";

// ---------------------------------------------------------------------------
// Server Functions for User 360. Contact logging needs a lead, so the first
// call opens a manual one at the user's current routing priority.
//
// KNOWN GAP: sign-in is a single shared login, so the actor is fixed.
// ---------------------------------------------------------------------------

const ACTOR = "dashboard:admin";
const userIdSchema = z.string().min(1).max(128);

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: "Invalid input" };
  console.error("[user-360 action]", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** The user's open lead, creating a manual one when sales has not engaged yet. */
async function ensureLead(userId: string): Promise<string> {
  return withTransaction(async (client) => {
    const existing = await findOpenLead(client, userId);
    if (existing) return existing.id;
    const signal = await queryOne<{ priority: LeadPriority | null; priority_reason: string | null; priority_trigger: string | null; next_best_action: string | null }>(
      "SELECT priority, priority_reason, priority_trigger, next_best_action FROM pql_scores WHERE user_id = $1",
      [userId]
    );
    const priority = signal?.priority ?? "P2";
    const result = await upsertRuleLead(client, {
      userId,
      priority,
      reason: signal?.priority_reason ?? "Opened from User 360",
      reasonCode: signal?.priority_trigger ?? "manual",
      ruleId: null,
      source: "manual",
      slaMinutes: MANUAL_SLA_MINUTES[priority],
      nextAction: signal?.next_best_action ?? null,
    });
    if (result.leadId) return result.leadId;
    const lead = await findOpenLead(client, userId);
    if (!lead) throw new ApiError("INVALID_STATE", "This user is in a suppression window, so no lead was created.");
    return lead.id;
  });
}

export async function logContactAction(
  userId: string,
  type: "call" | "whatsapp" | "email",
  demo: boolean,
  outcome?: string
): Promise<ActionResult<{ leadId: string }>> {
  const stop = await writeRefusal("Logging contacts", demo);
  if (stop) return stop;
  try {
    const input = z.object({ userId: userIdSchema, type: z.enum(["call", "whatsapp", "email"]) }).parse({ userId, type });
    await assertUserExists(input.userId);
    const leadId = await ensureLead(input.userId);
    await logActivity(leadId, ACTOR, { type: input.type, outcome: outcome ?? (input.type === "call" ? undefined : "sent") });
    return { ok: true, data: { leadId } };
  } catch (err) {
    return failure(err);
  }
}

export async function addNoteAction(userId: string, body: string, demo: boolean): Promise<ActionResult<{ at: string }>> {
  const stop = await writeRefusal("Adding notes", demo);
  if (stop) return stop;
  try {
    const input = z.object({ userId: userIdSchema, body: z.string().trim().min(1).max(10_000) }).parse({ userId, body });
    await assertUserExists(input.userId);
    const lead = await queryOne<{ id: string }>(
      "SELECT id FROM sales_leads WHERE user_id = $1 AND status IN ('new','contacted','interested','callback')",
      [input.userId]
    );
    const row = await queryOne<{ occurred_at: Date }>(
      `INSERT INTO sales_activities (lead_id, user_id, actor_id, type, body) VALUES ($1, $2, $3, 'note', $4) RETURNING occurred_at`,
      [lead?.id ?? null, input.userId, ACTOR, input.body]
    );
    await audit({ actorId: ACTOR, action: "note.created", entityType: "user", entityId: input.userId, metadata: { source: "user-360" } });
    return { ok: true, data: { at: (row?.occurred_at ?? new Date()).toISOString() } };
  } catch (err) {
    return failure(err);
  }
}

export async function scheduleCallbackAction(userId: string, dueAt: string, notes: string, demo: boolean): Promise<ActionResult<{ dueAt: string }>> {
  const stop = await writeRefusal("Scheduling callbacks", demo);
  if (stop) return stop;
  try {
    const input = z
      .object({ userId: userIdSchema, dueAt: z.iso.datetime({ offset: true }), notes: z.string().trim().max(2000) })
      .parse({ userId, dueAt, notes });
    await assertUserExists(input.userId);
    const leadId = await ensureLead(input.userId);
    const callback = await scheduleCallback(leadId, ACTOR, { due_at: input.dueAt, notes: input.notes || undefined });
    return { ok: true, data: { dueAt: new Date((callback as { due_at: Date }).due_at).toISOString() } };
  } catch (err) {
    return failure(err);
  }
}

export async function assignOwnerAction(userId: string, ownerId: string, demo: boolean): Promise<ActionResult<{ ownerName: string | null }>> {
  const stop = await writeRefusal("Assigning leads", demo);
  if (stop) return stop;
  try {
    const input = z.object({ userId: userIdSchema, ownerId: z.string().uuid() }).parse({ userId, ownerId });
    const result = await assignUser({ userId: input.userId, ownerId: input.ownerId, reason: "Assigned from User 360", actor: ACTOR });
    return { ok: true, data: { ownerName: (result.lead as { owner_name?: string | null }).owner_name ?? null } };
  } catch (err) {
    return failure(err);
  }
}

export async function loadMoreRawEventsAction(userId: string, cursor: string, demo: boolean): Promise<ActionResult<{ rows: RawEventRow[]; nextCursor: string | null }>> {
  const signedOut = await sessionRefusal();
  if (signedOut) return signedOut;
  if (demo) return { ok: true, data: { rows: [], nextCursor: null } };
  try {
    const input = z.object({ userId: userIdSchema, cursor: z.string().min(1).max(500) }).parse({ userId, cursor });
    return { ok: true, data: await loadRawEvents(input.userId, input.cursor) };
  } catch (err) {
    return failure(err);
  }
}

/** Unmasked contact details, audited (SOP 17.2/17.3). */
export async function revealContactAction(userId: string, demo: boolean): Promise<ActionResult<{ email: string | null; phone: string | null }>> {
  const signedOut = await sessionRefusal();
  if (signedOut) return signedOut;
  if (demo) return { ok: false, error: "Revealing contact details is disabled while showing demo data." };
  try {
    const id = userIdSchema.parse(userId);
    const found = await queryOne<{ user_id: string; email: string | null; phone: string | null }>(
      "SELECT user_id, email, phone FROM users WHERE user_id = $1",
      [id]
    );
    if (!found) throw new ApiError("NOT_FOUND", "User not found");
    const row = (await withUserDetails([found], { name: null }))[0]!;
    // The audit row cannot be written on a read-only connection.
    if (canWriteAudit()) {
      await audit({ actorId: ACTOR, action: "pii.revealed", entityType: "user", entityId: id, metadata: { endpoint: "/user-intelligence/[userId]" } });
    }
    return { ok: true, data: { email: row.email, phone: row.phone } };
  } catch (err) {
    return failure(err);
  }
}
