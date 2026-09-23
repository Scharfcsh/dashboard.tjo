import { leadPool } from "@/lib/dashboards/sales";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { parseRange, rangeQuerySchema } from "@/lib/time/business-time";

// GET /api/sales/lead-pool?range=today
// Every unpaid user active in the range, in the band that says how to treat them.
export const GET = handler(async (req) => {
  const q = parseQuery(req, rangeQuerySchema);
  return Response.json(await leadPool(parseRange(q)));
});
