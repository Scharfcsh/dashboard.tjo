import { z } from "zod";
import { callerPipeline } from "@/lib/dashboards/sales";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { resolveCaller } from "@/lib/sales/caller";

// GET /api/sales/pipeline?owner_id=<team member>
// Each of the caller's leads counted once, in the furthest stage it reached.
export const GET = handler(async (req) => {
  const q = parseQuery(req, z.object({ owner_id: z.string().optional() }));
  const ownerId = await resolveCaller(req, q.owner_id);
  return Response.json(await callerPipeline(ownerId));
});
