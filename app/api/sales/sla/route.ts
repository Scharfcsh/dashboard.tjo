import { z } from "zod";
import { slaMetrics } from "@/lib/dashboards/sales";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { resolveCaller } from "@/lib/sales/caller";

// GET /api/sales/sla?owner_id=<team member>
// Response times and SLA breaches. Omit owner_id for the whole team.
export const GET = handler(async (req) => {
  const q = parseQuery(req, z.object({ owner_id: z.string().optional() }));
  const ownerId = q.owner_id ? await resolveCaller(req, q.owner_id) : null;
  return Response.json(await slaMetrics(ownerId));
});
