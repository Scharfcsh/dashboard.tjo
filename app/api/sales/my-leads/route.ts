import { z } from "zod";
import { myLeads } from "@/lib/dashboards/sales";
import { offsetPage, offsetQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { auditPiiReveal, wantsPii } from "@/lib/pii";
import { resolveCaller } from "@/lib/sales/caller";

// GET /api/sales/my-leads?status=open|all&priority=P0&limit=&offset=&owner_id=&reveal_pii=
// headers: x-actor-id = caller's team member id (or owner_id param for a manager view).
// Ranked for calling: due callbacks, overdue P0, priority, PQL score, recency.
const schema = offsetQuerySchema.extend({
  status: z.enum(["open", "all"]).default("open"),
  priority: z.enum(["P0", "P1", "P2"]).optional(),
  owner_id: z.string().optional(),
  reveal_pii: z.string().optional(),
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const ownerId = await resolveCaller(req, q.owner_id);
  const reveal = wantsPii(req);
  const result = await myLeads(ownerId, q, { status: q.status, priority: q.priority, reveal });
  if (reveal) await auditPiiReveal(req, result.userIds, "/api/sales/my-leads");
  return Response.json({
    ...offsetPage(result.data, q.limit, q.offset, result.total),
    summary: result.summary,
    meta: { owner_id: ownerId, ordering: "due callbacks, overdue P0, priority, PQL score, last active", pii: reveal ? "revealed" : "masked" },
  });
});
