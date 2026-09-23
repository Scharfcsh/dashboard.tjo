import { z } from "zod";
import { callbacksDue } from "@/lib/dashboards/sales";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { resolveCaller } from "@/lib/sales/caller";
import { parseRange, rangeQuerySchema } from "@/lib/time/business-time";

// GET /api/sales/callbacks?owner_id=<team member>&range=today&limit=20
// Pending callbacks owned by the caller, soonest first.
const schema = rangeQuerySchema.extend({
  owner_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const ownerId = await resolveCaller(req, q.owner_id);
  return Response.json(await callbacksDue(ownerId, parseRange(q), q.limit));
});
