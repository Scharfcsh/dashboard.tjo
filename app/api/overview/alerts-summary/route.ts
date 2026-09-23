import { z } from "zod";
import { alertsSummary } from "@/lib/dashboards/overview";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { parseRange, rangeQuerySchema } from "@/lib/time/business-time";

// GET /api/overview/alerts-summary?range=today&limit=10 - critical (P0) alert counts + most recent open ones.
const schema = rangeQuerySchema.extend({ limit: z.coerce.number().int().min(1).max(50).default(10) });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await alertsSummary(parseRange(q), q.limit));
});
