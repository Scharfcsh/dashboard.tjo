import { userSessions } from "@/lib/dashboards/user360";
import { cursorQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { routeParam } from "@/lib/http/route-helpers";
import { z } from "zod";

type Ctx = { params: Promise<{ userId: string }> };

// GET /api/users/:userId/sessions?limit=20&cursor=&include_events=true
// Sessions newest first, each with its event timeline (browser events + server events during the session).
const schema = cursorQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  include_events: z.enum(["true", "false"]).default("true"),
});

export const GET = handler<Ctx>(async (req, ctx) => {
  const q = parseQuery(req, schema);
  return Response.json(await userSessions(await routeParam(ctx, "userId"), q, q.include_events === "true"));
});
