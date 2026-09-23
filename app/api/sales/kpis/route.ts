import { z } from "zod";
import { callerKpis } from "@/lib/dashboards/sales";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { resolveCaller } from "@/lib/sales/caller";
import { rangeQuerySchema, parseRange } from "@/lib/time/business-time";

// GET /api/sales/kpis?owner_id=<team member>&range=today
// The caller's own numbers: queue pressure, contact outcomes and attributed revenue.
const schema = rangeQuerySchema.extend({ owner_id: z.string().optional() });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const ownerId = await resolveCaller(req, q.owner_id);
  return Response.json(await callerKpis(ownerId, parseRange(q)));
});
