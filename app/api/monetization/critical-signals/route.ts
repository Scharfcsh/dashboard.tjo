import { criticalSignals } from "@/lib/dashboards/monetization";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { userFilterQuerySchema } from "@/lib/metrics/filters";

// GET /api/monetization/critical-signals?country=&source=
// The six "act today" counts: 50/50 unpaid, 45+ with pricing intent, checkout abandoned,
// payment failed, hot PQLs without an owner, and users who converted after hitting the limit.
export const GET = handler(async (req) => {
  const q = parseQuery(req, userFilterQuerySchema);
  return Response.json(await criticalSignals(q));
});
