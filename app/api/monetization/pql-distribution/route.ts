import { pqlDistribution } from "@/lib/dashboards/monetization";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { booleanParam } from "@/lib/http/route-helpers";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/monetization/pql-distribution?country=&source=&include_paid=false
// Scored users per PQL band (Buy Now 90+, Hot 75-89, Warm 60-74, Engaged 40-59, Early <40).
const schema = userFilterQuerySchema.extend({ include_paid: booleanParam });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await pqlDistribution(q, q.include_paid));
});
