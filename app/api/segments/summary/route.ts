import { z } from "zod";
import { BREAKDOWNS, segmentsSummary, type Breakdown } from "@/lib/dashboards/segments";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/segments/summary?country=&source=&breakdown=country|source|target_role|plan
// Current lifecycle stage counts (new, onboarded, activated, engaged, power_user, pql, dormant, resurrected, paid).
const schema = userFilterQuerySchema.extend({
  breakdown: z.enum(Object.keys(BREAKDOWNS) as [Breakdown, ...Breakdown[]]).optional(),
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await segmentsSummary(q, q.breakdown));
});
