import { callerLeaderboard } from "@/lib/dashboards/sales";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { parseRange, rangeQuerySchema } from "@/lib/time/business-time";

// GET /api/sales/leaderboard?range=today
// Per-caller performance, grouped by the lead's owner rather than by who typed.
export const GET = handler(async (req) => {
  const q = parseQuery(req, rangeQuerySchema);
  return Response.json(await callerLeaderboard(parseRange(q)));
});
