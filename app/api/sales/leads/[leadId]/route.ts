import { leadById } from "@/lib/dashboards/sales";
import { handler } from "@/lib/http/respond";
import { routeParam, uuidParam } from "@/lib/http/route-helpers";
import { auditPiiReveal, wantsPii } from "@/lib/pii";

// GET /api/sales/leads/:leadId?reveal_pii=true
// One lead with the user context a caller needs before dialling.
export const GET = handler(async (req, ctx: { params: Promise<{ leadId: string }> }) => {
  const leadId = uuidParam(await routeParam(ctx, "leadId"), "Lead");
  const reveal = wantsPii(req);
  const data = await leadById(leadId, reveal);
  if (reveal) await auditPiiReveal(req, [data.user.user_id], `/api/sales/leads/${leadId}`);
  return Response.json({ data, meta: { pii: reveal ? "revealed" : "masked" } });
});
