import { featureAdoption } from "@/lib/dashboards/analytics";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { rangeAndFilters } from "@/lib/http/route-helpers";
import { parseRange } from "@/lib/time/business-time";

// GET /api/analytics/feature-adoption?range=90d&country=&source=
// % of signups adopting each feature in their first week, and week-4 retention of adopters vs non-adopters.
export const GET = handler(async (req) => {
  const q = parseQuery(req, rangeAndFilters);
  return Response.json(await featureAdoption(parseRange(q, { defaultPreset: "90d" }), q));
});
