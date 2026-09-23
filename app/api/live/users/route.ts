import { z } from "zod";
import { liveDefinitions, liveSummary, liveUsers } from "@/lib/dashboards/live";
import { offsetPage, offsetQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { userFilterQuerySchema } from "@/lib/metrics/filters";
import { auditPiiReveal, wantsPii } from "@/lib/pii";

// GET /api/live/users?status=online|today&search=&min_score=&country=&source=&limit=&offset=&reveal_pii=
// Users online now (heartbeat window) or active today, with current page/action, session duration,
// Auto Apply usage, pricing intent, PQL score and sales owner. `summary` holds the top KPI cards.
const schema = offsetQuerySchema.extend(userFilterQuerySchema.shape).extend({
  status: z.enum(["online", "today"]).default("online"),
  search: z.string().trim().min(1).max(100).optional(),
  min_score: z.coerce.number().int().min(0).max(100).optional(),
  reveal_pii: z.string().optional(),
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const reveal = wantsPii(req);
  const [result, summary] = await Promise.all([
    liveUsers(q.status, q, q, { search: q.search, minScore: q.min_score, reveal }),
    liveSummary(q),
  ]);
  if (reveal) await auditPiiReveal(req, result.userIds, "/api/live/users");
  return Response.json({
    ...offsetPage(result.data, q.limit, q.offset, result.total),
    summary,
    meta: { status: q.status, generated_at: new Date().toISOString(), pii: reveal ? "revealed" : "masked" },
    definitions: liveDefinitions(),
  });
});
