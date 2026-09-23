import { usageStages } from "@/lib/dashboards/monetization";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { booleanParam } from "@/lib/http/route-helpers";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/monetization/usage-stages?country=&source=&include_paid=false
// Users bucketed by free Auto Apply usage (0-10, 11-25, 26-39, 40-44, 45-49, 50). Paid users excluded by default.
const schema = userFilterQuerySchema.extend({ include_paid: booleanParam });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await usageStages(q, q.include_paid));
});
