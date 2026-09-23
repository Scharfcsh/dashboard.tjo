import { z } from "zod";
import { listOpportunities, PRICING_INTENTS } from "@/lib/dashboards/opportunities";
import { offsetPage, offsetQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { booleanParam } from "@/lib/http/route-helpers";
import { definitionsFor } from "@/lib/metrics/definitions";
import { userFilterQuerySchema } from "@/lib/metrics/filters";
import { auditPiiReveal, wantsPii } from "@/lib/pii";
import { FREE_AUTO_APPLY_LIMIT } from "@/lib/events/catalog";
import { HOT_PQL_MIN_SCORE } from "@/lib/scoring/pql-config";
import { PRIORITY_TRIGGERS } from "@/lib/scoring/priority";

// GET /api/monetization/hot-leads?priority=P0&trigger=quota_exhausted&unassigned_only=true&min_score=75
//     &usage_min=&usage_max=&pricing_intent=abandoned&owner_id=&lead_status=&include_paid=false&limit=&offset=
// Highest-priority unconverted users with usage / pricing / checkout signals and the lead reason.
// lead_status accepts a sales_leads status or "unassigned" (no open lead with an owner).
const schema = offsetQuerySchema.extend(userFilterQuerySchema.shape).extend({
  min_score: z.coerce.number().int().min(0).max(100).default(HOT_PQL_MIN_SCORE),
  priority: z.enum(["P0", "P1", "P2"]).optional(),
  trigger: z.enum(PRIORITY_TRIGGERS).optional(),
  unassigned_only: booleanParam,
  usage_min: z.coerce.number().int().min(0).max(FREE_AUTO_APPLY_LIMIT).optional(),
  usage_max: z.coerce.number().int().min(0).max(FREE_AUTO_APPLY_LIMIT).optional(),
  pricing_intent: z.enum(PRICING_INTENTS).optional(),
  owner_id: z.uuid().optional(),
  lead_status: z.enum(["unassigned", "new", "contacted", "interested", "callback"]).optional(),
  include_paid: booleanParam,
  reveal_pii: z.string().optional(),
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const reveal = wantsPii(req);
  const result = await listOpportunities(q, q, {
    minScore: q.min_score,
    priority: q.priority,
    trigger: q.trigger,
    unassignedOnly: q.unassigned_only,
    usageMin: q.usage_min,
    usageMax: q.usage_max,
    pricingIntent: q.pricing_intent,
    ownerId: q.owner_id,
    leadStatus: q.lead_status,
    includePaid: q.include_paid,
    reveal,
  });
  if (reveal) await auditPiiReveal(req, result.userIds, "/api/monetization/hot-leads");
  return Response.json({
    ...offsetPage(result.data, q.limit, q.offset, result.total),
    meta: {
      inclusion: `${q.include_paid ? "Users" : "Unpaid users"} with a routing priority (SOP 5.3) or PQL score >= min_score (default ${HOT_PQL_MIN_SCORE}).`,
      ordering: "priority (P0 first), then PQL score desc, then most recently active",
      pii: reveal ? "revealed" : "masked",
    },
    definitions: definitionsFor(["hot_pqls", "auto_apply_used", "checkout_abandoned"]),
  });
});
