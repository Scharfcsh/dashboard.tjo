import { monetizationFunnel } from "@/lib/dashboards/monetization";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { rangeAndFilters } from "@/lib/http/route-helpers";
import { parseRange } from "@/lib/time/business-time";

// GET /api/monetization/funnel?range=30d&country=&source=
// started -> 10 -> 25 -> 40 -> 45 -> 50 -> pricing -> checkout -> paid, for users who started Auto Apply in range.
export const GET = handler(async (req) => {
  const q = parseQuery(req, rangeAndFilters);
  return Response.json(await monetizationFunnel(parseRange(q, { defaultPreset: "30d" }), q));
});
