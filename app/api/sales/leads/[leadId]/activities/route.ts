import { z } from "zod";
import { ACTIVITY_OUTCOMES, logActivity } from "@/lib/dashboards/sales";
import { handler, readJson } from "@/lib/http/respond";
import { routeParam, uuidParam } from "@/lib/http/route-helpers";
import { requireActor } from "@/lib/sales/actor";

type Ctx = { params: Promise<{ leadId: string }> };

// POST /api/sales/leads/:leadId/activities   headers: x-actor-id
// Body: { "type": "call"|"whatsapp"|"email"|"note", "outcome"?: "connected"|"no_answer"|..., "body"?, "duration_seconds"?, "occurred_at"? }
// 201 { data: { activity, disposition_required } } - a connected call must be followed by POST .../disposition.
const schema = z
  .object({
    type: z.enum(["call", "whatsapp", "email", "note"]),
    outcome: z.enum(ACTIVITY_OUTCOMES).optional(),
    body: z.string().trim().max(10_000).optional(),
    duration_seconds: z.number().int().min(0).max(86_400).optional(),
    occurred_at: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const POST = handler<Ctx>(async (req, ctx) => {
  const leadId = uuidParam(await routeParam(ctx, "leadId"), "Lead");
  const actor = requireActor(req);
  const input = schema.parse(await readJson(req));
  return Response.json({ data: await logActivity(leadId, actor, input) }, { status: 201 });
});
