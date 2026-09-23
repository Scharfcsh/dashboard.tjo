"use server";

import { z } from "zod";
import { ruleInputSchema, saveRule } from "@/lib/dashboards/alerts";
import { ApiError } from "@/lib/http/errors";
import { leadsToCsv } from "@/lib/pql-intelligence/derive";
import { loadPqlIntelligence } from "@/lib/pql-intelligence/load";
import { parsePqlFilters } from "@/lib/pql-intelligence/filters";
import type { ActionResult } from "@/lib/revenue-center/types";

// Server Functions for Dashboard 4. Both are deliberately modest: exporting is
// read-only, and creating a rule leaves it inactive so nothing starts firing
// from a dashboard click.
//
// KNOWN GAP: like the other dashboards, these are not authenticated - proxy.ts
// only guards /api/*. Add sign-in before exposing this outside localhost.

const ACTOR = "dashboard:admin";

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError || err instanceof z.ZodError) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Invalid input" };
  }
  console.error("[pql-intelligence action]", err);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const paramsSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]).optional());

/**
 * The current upgrade queue as CSV. Email and phone are deliberately absent:
 * this leaves the browser as a file, so it must not carry contact details that
 * the page itself only shows masked.
 */
export async function exportCohortAction(
  searchParams: Record<string, string | string[] | undefined>
): Promise<ActionResult<{ filename: string; csv: string; rows: number }>> {
  try {
    const filters = parsePqlFilters(paramsSchema.parse(searchParams));
    const data = await loadPqlIntelligence(filters);
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = data.source.kind === "demo" ? "-demo" : "";
    return {
      ok: true,
      data: {
        filename: `pql-upgrade-leads-${stamp}${suffix}.csv`,
        csv: leadsToCsv(data.leads),
        rows: data.leads.length,
      },
    };
  } catch (err) {
    return failure(err);
  }
}

const alertRuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["P0", "P1", "P2"]),
  sla_minutes: z.number().int().min(1).max(60 * 24 * 30),
  usage_min: z.number().int().min(0).max(50).nullable(),
  score_min: z.number().int().min(0).max(100).nullable(),
  pricing_views_min: z.number().int().min(0).max(100).nullable(),
  unassigned_only: z.boolean(),
});

/**
 * Turn the current filters into an automation rule. Created as a draft with a
 * create_alert action, so a human still has to activate it.
 */
export async function createAlertRuleAction(
  input: unknown,
  demo: boolean
): Promise<ActionResult<{ id: string; name: string; status: string }>> {
  if (demo) return { ok: false, error: "Creating rules is disabled while showing demo data." };
  try {
    const q = alertRuleSchema.parse(input);
    // Cohort DSL conditions (lib/segments/conditions.ts): { field, cmp, value }.
    const conditions: { field: string; cmp: string; value: unknown }[] = [
      { field: "is_paid", cmp: "eq", value: false },
    ];
    if (q.usage_min !== null) conditions.push({ field: "auto_apply_used", cmp: "gte", value: q.usage_min });
    if (q.score_min !== null) conditions.push({ field: "pql_score", cmp: "gte", value: q.score_min });
    if (q.pricing_views_min !== null) {
      conditions.push({ field: "pricing_views_30d", cmp: "gte", value: q.pricing_views_min });
    }
    if (q.unassigned_only) conditions.push({ field: "has_open_lead", cmp: "eq", value: false });

    const rule = ruleInputSchema.parse({
      name: q.name,
      description: q.description || "Created from PQL & Auto Apply Intelligence.",
      category: "sales",
      conditions: { op: "and", conditions },
      actions: [{ type: "create_alert" }],
      priority: q.priority,
      owner_team: "sales",
      sla_minutes: q.sla_minutes,
      cooldown_hours: 24,
    });
    const result = await saveRule(rule, ACTOR);
    const saved = result.rule as { id: string; name: string; status: string };
    return { ok: true, data: { id: saved.id, name: saved.name, status: saved.status } };
  } catch (err) {
    return failure(err);
  }
}
