import { z } from "zod";
import { retentionCohorts } from "@/lib/dashboards/analytics";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/analytics/retention-cohorts?weeks=8&country=&source=
// Heatmap data: signup-week cohorts x D0/D1/D3/D7/D14/D30 retention. Incomplete cells are null.
const schema = userFilterQuerySchema.extend({ weeks: z.coerce.number().int().min(1).max(52).default(8) });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  return Response.json(await retentionCohorts(q.weeks, q));
});
