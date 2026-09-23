import { salesSummary } from "@/lib/dashboards/overview";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { parseRange, rangeQuerySchema } from "@/lib/time/business-time";

// GET /api/overview/sales-summary?range=today - lead pipeline stage counts + top performers.
export const GET = handler(async (req) => {
  return Response.json(await salesSummary(parseRange(parseQuery(req, rangeQuerySchema))));
});
