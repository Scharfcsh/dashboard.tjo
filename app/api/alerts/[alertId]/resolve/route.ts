import { z } from "zod";
import { resolveAlert } from "@/lib/dashboards/alerts";
import { handler, readJson } from "@/lib/http/respond";
import { routeParam, uuidParam } from "@/lib/http/route-helpers";
import { requireActor } from "@/lib/sales/actor";

type Ctx = { params: Promise<{ alertId: string }> };

// POST /api/alerts/:alertId/resolve   headers: x-actor-id   Body: { "resolution": "..." }
// 409 when already resolved. Audited.
const schema = z.object({ resolution: z.string().trim().min(1).max(2000) }).strict();

export const POST = handler<Ctx>(async (req, ctx) => {
  const alertId = uuidParam(await routeParam(ctx, "alertId"), "Alert");
  const actor = requireActor(req);
  const { resolution } = schema.parse(await readJson(req));
  return Response.json({ data: await resolveAlert(alertId, actor, resolution) });
});
