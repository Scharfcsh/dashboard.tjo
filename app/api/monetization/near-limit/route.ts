import { z } from "zod";
import { nearLimitCohort } from "@/lib/dashboards/monetization";
import { FREE_AUTO_APPLY_LIMIT } from "@/lib/events/catalog";
import { offsetPage, offsetQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { definitionsFor } from "@/lib/metrics/definitions";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/monetization/near-limit?threshold=45&country=&source=&limit=&offset=
// Unpaid users at or past `threshold` free Auto Applies, most urgent first
// (routing priority, then PQL score, then usage). Email and phone are masked.
const schema = offsetQuerySchema.extend(userFilterQuerySchema.shape).extend({
  threshold: z.coerce.number().int().min(1).max(FREE_AUTO_APPLY_LIMIT).default(40),
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const result = await nearLimitCohort(q.threshold, q, { limit: q.limit, offset: q.offset });
  return Response.json({
    ...offsetPage(result.data, q.limit, q.offset, result.total),
    meta: { threshold: result.threshold, excludes_paid: true, pii: "masked" },
    definitions: definitionsFor(["auto_apply_used", "free_applies_remaining"]),
  });
});
