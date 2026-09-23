import { z } from "zod";
import { evaluateCohort } from "@/lib/dashboards/segments";
import { handler, readJson } from "@/lib/http/respond";
import { auditPiiReveal, wantsPii } from "@/lib/pii";

// POST /api/cohorts/preview?reveal_pii=
// Body: { "definition": { "op": "and", "conditions": [ { "field": "auto_apply_used", "cmp": "gte", "value": 40 }, ... ] },
//         "sample_size"?: 20 }
// Dry run: matching user count + a sample. Same compiler as saved cohorts. Fields: GET /api/cohorts/fields.
const schema = z.object({ definition: z.unknown(), sample_size: z.number().int().min(0).max(100).default(20) }).strict();

export const POST = handler(async (req) => {
  const input = schema.parse(await readJson(req));
  const reveal = wantsPii(req);
  const result = await evaluateCohort(input.definition, input.sample_size, reveal);
  if (reveal) await auditPiiReveal(req, result.sample.map((s) => s.user_id), "/api/cohorts/preview");
  return Response.json({ data: { user_count: result.count, sample: result.sample }, meta: { pii: reveal ? "revealed" : "masked" } });
});
