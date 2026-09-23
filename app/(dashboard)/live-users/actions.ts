"use server";

import { z } from "zod";
import { audit } from "@/lib/audit";
import { queryOne } from "@/lib/db/pool";
import { currentSession } from "@/lib/dashboards/live";
import { ApiError } from "@/lib/http/errors";
import { mockLiveSession } from "@/lib/live-intelligence/mock";
import type { LiveSession } from "@/lib/live-intelligence/types";
import type { ActionResult, Tone } from "@/lib/revenue-center/types";

// Server Functions for Live User Intelligence. Same KNOWN GAP as the Revenue
// Command Center: dashboard pages are not authenticated yet.

const ACTOR = "dashboard:admin";
const MONETIZATION = new Set(["pricing_viewed", "plan_compared", "pro_clicked", "premium_clicked", "checkout_started", "checkout_abandoned", "payment_failed", "payment_success"]);
const TONE_BY_FAMILY: Record<string, Tone> = { auto_apply: "teal", usage_milestone: "purple", pricing: "amber", checkout: "amber", payment: "green", subscription: "green", system: "red" };

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: "Invalid input" };
  console.error("[live-intelligence action]", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function getLiveSessionAction(userId: string, demo: boolean): Promise<ActionResult<LiveSession | null>> {
  try {
    const id = z.string().min(1).max(128).parse(userId);
    if (demo) return { ok: true, data: mockLiveSession(id) };
    const { data } = await currentSession(id);
    if (!data) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        userId: id,
        sessionId: data.session_id,
        startedAt: new Date(data.started_at).toISOString(),
        isOnline: data.is_online,
        sessionNumber: data.session_number,
        device: data.device_type ? data.device_type[0]!.toUpperCase() + data.device_type.slice(1) : null,
        browser: [data.browser, data.os].filter(Boolean).join(" · ") || null,
        events: data.timeline
          .filter((e) => e.event_name !== "heartbeat")
          .map((e) => ({
            id: e.event_id,
            at: new Date(e.occurred_at).toISOString(),
            label: e.event_name === "page_view" && e.page ? `Opened ${e.page}` : e.label,
            detail: e.source === "server" ? "Server event" : e.page,
            tone: MONETIZATION.has(e.event_name) ? "amber" : (TONE_BY_FAMILY[e.family] ?? "green"),
            eventName: e.event_name,
            page: e.page,
            properties: e.properties ?? {},
            monetization: MONETIZATION.has(e.event_name),
          })),
      },
    };
  } catch (err) {
    return failure(err);
  }
}

/** Raise a manual follow-up alert (rule manual_follow_up). One per user per minute. */
export async function createAlertAction(userId: string, note: string, demo: boolean): Promise<ActionResult<{ alertId: string | null }>> {
  if (demo) return { ok: false, error: "Creating alerts is disabled while showing demo data." };
  try {
    const input = z.object({ userId: z.string().min(1).max(128), note: z.string().trim().max(500) }).parse({ userId, note });
    const minute = new Date().toISOString().slice(0, 16);
    const row = await queryOne<{ id: string }>(
      `INSERT INTO alerts (rule_id, rule_version, user_id, priority, category, owner_team, title, reason, idempotency_key, sla_due_at, context)
       SELECT r.id, r.version, $1, r.priority, r.category, r.owner_team, r.name, $2, $3, now() + make_interval(mins => r.sla_minutes), $4
       FROM alert_rules r WHERE r.id = 'manual_follow_up'
         AND EXISTS (SELECT 1 FROM users u WHERE u.user_id = $1)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [input.userId, input.note || "Flagged from Live User Intelligence", `manual_follow_up:${input.userId}:${minute}`, JSON.stringify({ source: "manual", actor: ACTOR })]
    );
    if (row) {
      await audit({ actorId: ACTOR, action: "alert.created_manually", entityType: "alert", entityId: row.id, metadata: { user_id: input.userId } });
    }
    return { ok: true, data: { alertId: row?.id ?? null } };
  } catch (err) {
    return failure(err);
  }
}
