import { pqlReasonBreakdown } from "@/lib/dashboards/monetization";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { booleanParam } from "@/lib/http/route-helpers";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/monetization/lead-reasons?country=&source=&include_paid=false
// How many users each positive scoring rule currently fires for, read from the stored
// pql_scores.reasons so the breakdown always agrees with the scores themselves.
const schema = userFilterQuerySchema.extend({ include_paid: booleanParam });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await pqlReasonBreakdown(q, q.include_paid));
});
