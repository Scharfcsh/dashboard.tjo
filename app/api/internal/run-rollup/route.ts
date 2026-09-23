import { z } from "zod";
import { runRollup } from "@/lib/jobs/pipeline";
import { jobResponse } from "@/lib/jobs/respond";
import { ApiError } from "@/lib/http/errors";
import { handler, readOptionalJson } from "@/lib/http/respond";
import { DATE_RE, diffDays, MAX_RANGE_DAYS } from "@/lib/time/business-time";

// POST /api/internal/run-rollup  (admin key)
// Body (optional): { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "user_id"?: "..." }
//   no body       -> incremental: events received since the last rollup
//   from/to       -> backfill those business dates (sessions, users, daily metrics, milestones, usage)
// Runs sessions + identity + daily rollup. Does not score - call run-scoring after.

const bodySchema = z
  .object({
    from: z.string().regex(DATE_RE).optional(),
    to: z.string().regex(DATE_RE).optional(),
    user_id: z.string().min(1).optional(),
  })
  .strict();

export const POST = handler(async (req) => {
  const body = bodySchema.parse(await readOptionalJson(req));
  if ((body.from && !body.to) || (!body.from && body.to)) {
    throw new ApiError("VALIDATION_FAILED", "Provide both from and to, or neither");
  }
  if (body.from && body.to) {
    const days = diffDays(body.from, body.to) + 1;
    if (days < 1 || days > MAX_RANGE_DAYS) throw new ApiError("VALIDATION_FAILED", `Range must be 1-${MAX_RANGE_DAYS} days`);
  }
  const outcome = await runRollup(
    "manual",
    body.from && body.to ? { from: body.from, to: body.to, userId: body.user_id } : undefined
  );
  return jobResponse(outcome);
});
