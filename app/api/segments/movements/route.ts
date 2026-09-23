import { z } from "zod";
import { lifecycleMovements } from "@/lib/dashboards/segments";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { booleanParam } from "@/lib/http/route-helpers";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/segments/movements?days=7&include_initial=false&country=&source=
// Lifecycle transitions (from -> to) in the last N days, plus entered/exited per stage.
const schema = userFilterQuerySchema.extend({
  days: z.coerce.number().int().min(1).max(365).default(7),
  include_initial: booleanParam,
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await lifecycleMovements(q.days, q, q.include_initial));
});
