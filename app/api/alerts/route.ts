import { z } from "zod";
import { listAlerts } from "@/lib/dashboards/alerts";
import { offsetPage, offsetQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { booleanParam } from "@/lib/http/route-helpers";

// GET /api/alerts?status=unresolved|open|acknowledged|resolved|all&priority=P0&team=sales&rule_id=&user_id=&overdue=true&limit=&offset=
// Alert queue (unresolved first, then priority, newest) + summary cards (open, P0, overdue, by category, SLA).
const schema = offsetQuerySchema.extend({
  status: z.enum(["open", "acknowledged", "resolved", "unresolved", "all"]).default("unresolved"),
  priority: z.enum(["P0", "P1", "P2"]).optional(),
  team: z.string().min(1).max(50).optional(),
  rule_id: z.string().min(1).max(100).optional(),
  user_id: z.string().min(1).optional(),
  overdue: booleanParam,
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const result = await listAlerts(
    { status: q.status, priority: q.priority, team: q.team, ruleId: q.rule_id, userId: q.user_id, overdue: q.overdue },
    q
  );
  return Response.json({ ...offsetPage(result.data, q.limit, q.offset, result.total), summary: result.summary });
});
