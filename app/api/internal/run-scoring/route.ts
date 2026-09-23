import { z } from "zod";
import { runScoring } from "@/lib/jobs/pipeline";
import { jobResponse } from "@/lib/jobs/respond";
import { handler, readOptionalJson } from "@/lib/http/respond";

// POST /api/internal/run-scoring  (admin key)
// Body (optional): { "all"?: boolean, "user_ids"?: string[] }
//   no body    -> incremental: users whose derived data changed since the last scoring run
//   all: true  -> rescore every user (the hourly sweep)
//   user_ids   -> just these users
// Writes pql_scores/history, lifecycle_state/history, then evaluates alert rules and leads.

const bodySchema = z
  .object({
    all: z.boolean().optional(),
    user_ids: z.array(z.string().min(1)).max(5000).optional(),
  })
  .strict();

export const POST = handler(async (req) => {
  const body = bodySchema.parse(await readOptionalJson(req));
  return jobResponse(await runScoring("manual", { all: body.all, userIds: body.user_ids }));
});
