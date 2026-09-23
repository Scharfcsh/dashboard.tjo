import { z } from "zod";
import { salesActivities } from "@/lib/dashboards/user360";
import { cursorQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { routeParam } from "@/lib/http/route-helpers";

type Ctx = { params: Promise<{ userId: string }> };

// GET /api/users/:userId/sales-activities?type=call|whatsapp|email|note|disposition&limit=&cursor=
const schema = cursorQuerySchema.extend({ type: z.enum(["call", "whatsapp", "email", "note", "disposition"]).optional() });

export const GET = handler<Ctx>(async (req, ctx) => {
  const q = parseQuery(req, schema);
  return Response.json(await salesActivities(await routeParam(ctx, "userId"), q, q.type));
});
