import { user360 } from "@/lib/dashboards/user360";
import { handler } from "@/lib/http/respond";
import { routeParam } from "@/lib/http/route-helpers";
import { auditPiiReveal, wantsPii } from "@/lib/pii";

type Ctx = { params: Promise<{ userId: string }> };

// GET /api/users/:userId/360?reveal_pii=true
// Identity, acquisition, usage, PQL + reasons, lifecycle, subscription, sales engagement, product health.
export const GET = handler<Ctx>(async (req, ctx) => {
  const userId = await routeParam(ctx, "userId");
  const reveal = wantsPii(req);
  const body = await user360(userId, reveal);
  if (reveal) await auditPiiReveal(req, [userId], "/api/users/:userId/360");
  return Response.json(body);
});
