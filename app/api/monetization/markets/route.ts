import { z } from "zod";
import { marketConversion } from "@/lib/dashboards/monetization";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { rangeAndFilters } from "@/lib/http/route-helpers";
import { parseRange } from "@/lib/time/business-time";

// GET /api/monetization/markets?range=30d&from=&to=&country=&source=&limit=10
// Usage-to-paid conversion per country for the signup cohort in the range.
const schema = rangeAndFilters.extend({ limit: z.coerce.number().int().min(1).max(50).default(10) });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await marketConversion(parseRange({ ...q, range: q.range ?? "30d" }), q, q.limit));
});
