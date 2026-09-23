import { activationFunnel } from "@/lib/dashboards/analytics";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { rangeAndFilters } from "@/lib/http/route-helpers";
import { parseRange } from "@/lib/time/business-time";

// GET /api/analytics/activation-funnel?range=30d&country=&source=
// signup -> onboarded -> resume -> first Auto Apply -> first value -> activated, with drop-off % and time to first value.
export const GET = handler(async (req) => {
  const q = parseQuery(req, rangeAndFilters);
  return Response.json(await activationFunnel(parseRange(q, { defaultPreset: "30d" }), q));
});
