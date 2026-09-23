import { z } from "zod";
import { DISPOSITIONS, setDisposition } from "@/lib/dashboards/sales";
import { handler, readJson } from "@/lib/http/respond";
import { routeParam, uuidParam } from "@/lib/http/route-helpers";
import { requireActor } from "@/lib/sales/actor";

type Ctx = { params: Promise<{ leadId: string }> };

// POST /api/sales/leads/:leadId/disposition   headers: x-actor-id
// Body: { "disposition": one of DISPOSITIONS, "notes"?, "callback_at"? (required for callback),
//         "suppress_days"? (not_interested, default 30), "objection"? }
// System actions per SOP 6.3: callback -> task; no_answer -> retry, never lost; not_interested -> lost + suppression;
// converted -> closed; needs_support -> support alert. 409 if the lead is already closed.
const schema = z
  .object({
    disposition: z.enum(DISPOSITIONS),
    notes: z.string().trim().max(10_000).optional(),
    callback_at: z.iso.datetime({ offset: true }).optional(),
    suppress_days: z.number().int().min(1).max(365).optional(),
    objection: z.string().trim().max(200).optional(),
  })
  .strict();

export const POST = handler<Ctx>(async (req, ctx) => {
  const leadId = uuidParam(await routeParam(ctx, "leadId"), "Lead");
  const actor = requireActor(req);
  const input = schema.parse(await readJson(req));
  return Response.json({ data: await setDisposition(leadId, actor, input) });
});
