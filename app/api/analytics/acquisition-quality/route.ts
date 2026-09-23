import { acquisitionQuality } from "@/lib/dashboards/analytics";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { rangeAndFilters } from "@/lib/http/route-helpers";
import { parseRange } from "@/lib/time/business-time";

// GET /api/analytics/acquisition-quality?range=90d&country=
// Signups, 7-day activation, D7 retention and paid rate per first-touch acquisition source.
export const GET = handler(async (req) => {
  const q = parseQuery(req, rangeAndFilters);
  return Response.json(await acquisitionQuality(parseRange(q, { defaultPreset: "90d" }), q));
});
