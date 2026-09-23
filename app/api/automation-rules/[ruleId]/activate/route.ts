import { activateRule } from "@/lib/dashboards/alerts";
import { actorId } from "@/lib/http/auth";
import { handler } from "@/lib/http/respond";
import { routeParam } from "@/lib/http/route-helpers";

type Ctx = { params: Promise<{ ruleId: string }> };

// POST /api/automation-rules/:ruleId/activate
// 409 unless the current version has a successful test run. The next pipeline tick starts evaluating it.
export const POST = handler<Ctx>(async (req, ctx) => {
  const result = await activateRule(await routeParam(ctx, "ruleId"), actorId(req.headers));
  return Response.json({ data: result.rule, meta: { changed: result.changed } });
});
