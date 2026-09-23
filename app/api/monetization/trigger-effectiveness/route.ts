import { z } from "zod";
import { triggerEffectiveness } from "@/lib/dashboards/monetization";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { rangeAndFilters } from "@/lib/http/route-helpers";
import { parseRange } from "@/lib/time/business-time";

// GET /api/monetization/trigger-effectiveness?range=90d&window_days=14&country=&source=
// Conversion rate per usage milestone (and per upgrade prompt, when prompt exposure is tracked).
const schema = rangeAndFilters.extend({ window_days: z.coerce.number().int().min(1).max(90).default(14) });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await triggerEffectiveness(parseRange(q, { defaultPreset: "90d" }), q, q.window_days));
});
