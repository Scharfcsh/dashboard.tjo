import { z } from "zod";
import { nextLead } from "@/lib/dashboards/sales";
import { parseQuery } from "@/lib/http/query";
import { handler } from "@/lib/http/respond";
import { booleanParam } from "@/lib/http/route-helpers";
import { auditPiiReveal, wantsPii } from "@/lib/pii";
import { resolveCaller } from "@/lib/sales/caller";

// GET /api/sales/next-lead?include_unassigned=false&owner_id=&reveal_pii=   headers: x-actor-id
// The single lead to call now. Leads waiting on a future callback or retry are skipped until due.
// With include_unassigned=true, falls back to the top unassigned lead (not auto-assigned).
const schema = z.object({ include_unassigned: booleanParam, owner_id: z.string().optional(), reveal_pii: z.string().optional() });

export const GET = handler(async (req) => {
  const q = parseQuery(req, schema);
  const ownerId = await resolveCaller(req, q.owner_id);
  const reveal = wantsPii(req);
  const result = await nextLead(ownerId, q.include_unassigned, reveal);
  if (reveal && result.data) await auditPiiReveal(req, [result.data.user.user_id], "/api/sales/next-lead");
  return Response.json({ data: result.data, meta: { owner_id: ownerId, source: result.source } });
});
