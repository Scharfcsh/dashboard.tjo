import { pqlHistory } from "@/lib/dashboards/user360";
import { cursorQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { routeParam } from "@/lib/http/route-helpers";

type Ctx = { params: Promise<{ userId: string }> };

// GET /api/users/:userId/pql-history?limit=&cursor= - every score change with its reasons and rules version.
export const GET = handler<Ctx>(async (req, ctx) => {
  return Response.json(await pqlHistory(await routeParam(ctx, "userId"), parseQuery(req, cursorQuerySchema)));
});
