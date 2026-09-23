import { overviewFunnel } from "@/lib/dashboards/overview";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { rangeAndFilters } from "@/lib/http/route-helpers";
import { parseRange } from "@/lib/time/business-time";

// GET /api/overview/funnel?range=today&country=&source=
// active -> activated -> core feature -> PQL -> pricing -> checkout -> paid (nested, unique users).
export const GET = handler(async (req) => {
  const q = parseQuery(req, rangeAndFilters);
  return Response.json(await overviewFunnel(parseRange(q), q));
});
