"use server";

import { z } from "zod";
import { assignUser } from "@/lib/dashboards/live";
import { logActivity } from "@/lib/dashboards/sales";
import { ApiError } from "@/lib/http/errors";
import { mockLiveUser360 } from "@/lib/live-intelligence/mock";
import { mockUser360 } from "@/lib/mock-data";
import { loadUser360 } from "@/lib/revenue-center/user360";
import type { ActionResult, User360View } from "@/lib/revenue-center/types";

// ---------------------------------------------------------------------------
// Server Functions for the Revenue Command Center. They call the analytics
// library directly, so the admin API key never reaches the browser.
//
// KNOWN GAP: dashboard pages and these functions are not authenticated yet
// (proxy.ts only guards /api/*). The acting user is recorded as
// "dashboard:admin" until real sign-in exists.
// ---------------------------------------------------------------------------

const ACTOR = "dashboard:admin";

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError || err instanceof z.ZodError) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Invalid input" };
  }
  console.error("[revenue-center action]", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function getUser360Action(userId: string, demo: boolean): Promise<ActionResult<User360View>> {
  try {
    const id = z.string().min(1).max(128).parse(userId);
    if (demo) {
      // Demo users from either dashboard.
      const view = mockUser360(id) ?? mockLiveUser360(id);
      return view ? { ok: true, data: view } : { ok: false, error: "User not found" };
    }
    return { ok: true, data: await loadUser360(id) };
  } catch (err) {
    return failure(err);
  }
}

export async function assignOwnerAction(userId: string, ownerId: string, demo: boolean): Promise<ActionResult<{ ownerName: string | null }>> {
  if (demo) return { ok: false, error: "Assignment is disabled while showing demo data." };
  try {
    const input = z.object({ userId: z.string().min(1).max(128), ownerId: z.string().uuid() }).parse({ userId, ownerId });
    const result = await assignUser({ userId: input.userId, ownerId: input.ownerId, reason: "Assigned from Revenue Command Center", actor: ACTOR });
    return { ok: true, data: { ownerName: (result.lead as { owner_name?: string | null }).owner_name ?? null } };
  } catch (err) {
    return failure(err);
  }
}

export async function logContactAction(
  leadId: string,
  type: "call" | "whatsapp" | "email",
  demo: boolean
): Promise<ActionResult<{ at: string }>> {
  if (demo) return { ok: false, error: "Logging contacts is disabled while showing demo data." };
  try {
    const input = z.object({ leadId: z.string().uuid(), type: z.enum(["call", "whatsapp", "email"]) }).parse({ leadId, type });
    const result = await logActivity(input.leadId, ACTOR, { type: input.type, outcome: input.type === "call" ? undefined : "sent" });
    return { ok: true, data: { at: new Date((result.activity as { occurred_at: Date }).occurred_at).toISOString() } };
  } catch (err) {
    return failure(err);
  }
}
