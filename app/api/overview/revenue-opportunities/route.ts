import { z } from "zod";
import { listOpportunities } from "@/lib/dashboards/opportunities";
import { offsetPage, offsetQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { userFilterQuerySchema } from "@/lib/metrics/filters";
import { definitionsFor } from "@/lib/metrics/definitions";
import { auditPiiReveal, wantsPii } from "@/lib/pii";

// GET /api/overview/revenue-opportunities?limit=&offset=&min_score=60&country=&source=&reveal_pii=true
// Unpaid users with a routing priority or a score >= min_score, most urgent first.
const schema = offsetQuerySchema.extend(userFilterQuerySchema.shape).extend({
  min_score: z.coerce.number().int().min(0).max(100).default(60),
  reveal_pii: z.string().optional(),
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const reveal = wantsPii(req);
  const result = await listOpportunities(q, q, { minScore: q.min_score, reveal });
  if (reveal) await auditPiiReveal(req, result.userIds, "/api/overview/revenue-opportunities");
  return Response.json({
    ...offsetPage(result.data, q.limit, q.offset, result.total),
    meta: { ordering: "priority (P0 first), then PQL score desc, then most recently active", pii: reveal ? "revealed" : "masked" },
    definitions: definitionsFor(["hot_pqls", "auto_apply_used", "lifecycle_stage"]),
  });
});
