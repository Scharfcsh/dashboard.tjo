import { z } from "zod";
import { listCohorts, saveCohort } from "@/lib/dashboards/segments";
import { actorId } from "@/lib/http/auth";
import { offsetPage, offsetQuerySchema } from "@/lib/http/pagination";
import { parseQuery } from "@/lib/http/query";
import { handler, readJson } from "@/lib/http/respond";
import { booleanParam } from "@/lib/http/route-helpers";

// GET  /api/cohorts?limit=&offset=&with_counts=true   saved cohorts with their current definition
// POST /api/cohorts   Body: { "name", "description"?, "definition", "id"? }
//   without id -> new cohort (version 1); with id -> new version of that cohort. Definitions are never overwritten.

const listSchema = offsetQuerySchema.extend({ with_counts: booleanParam });
const saveSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    definition: z.unknown(),
  })
  .strict();

export const GET = handler(async (req) => {
  const q = parseQuery(req, listSchema);
  const result = await listCohorts(q, q.with_counts);
  return Response.json(offsetPage(result.data, q.limit, q.offset, result.total));
});

export const POST = handler(async (req) => {
  const input = saveSchema.parse(await readJson(req));
  const saved = await saveCohort({ ...input, actor: actorId(req.headers) });
  return Response.json({ data: saved }, { status: saved.version === 1 ? 201 : 200 });
});
