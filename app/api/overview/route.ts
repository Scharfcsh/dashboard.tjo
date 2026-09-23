import { overviewKpis } from "@/lib/dashboards/overview";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { rangeAndFilters } from "@/lib/http/route-helpers";
import { parseRange } from "@/lib/time/business-time";

// GET /api/overview?range=today|yesterday|7d|30d|90d|custom&from=&to=&country=IN&source=instagram
// Founder KPI cards with previous-period trends. Default range: today (business timezone).
export const GET = handler(async (req) => {
  const q = parseQuery(req, rangeAndFilters);
  return Response.json(await overviewKpis(parseRange(q), q));
});
