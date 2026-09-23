import { z } from "zod";
import { listRules, ruleInputSchema, saveRule } from "@/lib/dashboards/alerts";
import { actorId } from "@/lib/http/auth";
import { parseQuery } from "@/lib/http/query";
import { handler, readJson } from "@/lib/http/respond";

// GET  /api/automation-rules?status=draft|active|paused   rules with 7-day run stats
// POST /api/automation-rules   create a draft rule (or, with an existing custom `id`, save a new version as draft)
// Body: { id?, name, description?, category, conditions (cohort DSL - see GET /api/cohorts/fields),
//         actions: [{ "type": "create_alert"|"create_lead"|"send_whatsapp"|"send_email"|"notify" }],
//         priority, owner_team, sla_minutes, cooldown_hours? }
// Communication actions are recorded as skipped - no provider is connected.

const listSchema = z.object({ status: z.enum(["draft", "active", "paused"]).optional() });

export const GET = handler(async (req) => {
  const q = parseQuery(req, listSchema);
  return Response.json({ data: await listRules(q.status) });
});

export const POST = handler(async (req) => {
  const input = ruleInputSchema.parse(await readJson(req));
  const result = await saveRule(input, actorId(req.headers));
  return Response.json({ data: result.rule }, { status: result.created ? 201 : 200 });
});
