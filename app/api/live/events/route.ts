import { z } from "zod";
import { liveEvents } from "@/lib/dashboards/live";
import { cursorQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";

// GET /api/live/events?importance=high|medium|low&user_id=&event_name=&limit=&cursor=
// Important-events stream (last 7 days, newest first). Default importance=medium hides low-value clicks;
// heartbeats and page views are never included. Importance comes from lib/events/catalog.ts.
const schema = cursorQuerySchema.extend({
  importance: z.enum(["high", "medium", "low"]).default("medium"),
  user_id: z.string().min(1).optional(),
  event_name: z.string().min(1).max(100).optional(),
});

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const result = await liveEvents({
    importance: q.importance,
    limit: q.limit,
    cursor: q.cursor,
    userId: q.user_id,
    eventName: q.event_name,
  });
  return Response.json({ ...result, meta: { importance_at_least: q.importance, window: "7 days" } });
});
