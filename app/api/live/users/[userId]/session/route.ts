import { currentSession } from "@/lib/dashboards/live";
import { handler } from "@/lib/http/respond";
import { routeParam } from "@/lib/http/route-helpers";

type Ctx = { params: Promise<{ userId: string }> };

// GET /api/live/users/:userId/session - the user's current (or most recent) session with its event timeline.
export const GET = handler<Ctx>(async (_req, ctx) => {
  return Response.json(await currentSession(await routeParam(ctx, "userId")));
});
