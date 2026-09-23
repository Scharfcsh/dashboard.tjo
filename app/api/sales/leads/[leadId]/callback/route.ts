import { z } from "zod";
import { scheduleCallback } from "@/lib/dashboards/sales";
import { handler, readJson } from "@/lib/http/respond";
import { routeParam, uuidParam } from "@/lib/http/route-helpers";
import { requireActor } from "@/lib/sales/actor";

type Ctx = { params: Promise<{ leadId: string }> };

// POST /api/sales/leads/:leadId/callback   headers: x-actor-id
// Body: { "due_at": ISO-8601, "notes"?, "owner_id"? (defaults to the lead owner) } -> 201 { data: callback }
const schema = z
  .object({
    due_at: z.iso.datetime({ offset: true }),
    notes: z.string().trim().max(2000).optional(),
    owner_id: z.string().uuid().optional(),
  })
  .strict();

export const POST = handler<Ctx>(async (req, ctx) => {
  const leadId = uuidParam(await routeParam(ctx, "leadId"), "Lead");
  const actor = requireActor(req);
  const input = schema.parse(await readJson(req));
  return Response.json({ data: await scheduleCallback(leadId, actor, input) }, { status: 201 });
});
