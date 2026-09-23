import { queryRows } from "@/lib/db/pool";
import { handler } from "@/lib/http/respond";

// GET /api/internal/jobs  (admin key) - recent job runs, watermarks and ingestion lag.

export const GET = handler(async () => {
  const [runs, state, lag] = await Promise.all([
    queryRows(
      `SELECT id, job_name, status, trigger, stats, error, started_at, finished_at
       FROM job_runs ORDER BY started_at DESC LIMIT 50`
    ),
    queryRows("SELECT job_name, watermark, updated_at FROM job_state ORDER BY job_name"),
    queryRows<{ last_received_at: Date | null; unprocessed_events: string }>(
      `SELECT (SELECT max(received_at) FROM user_events) AS last_received_at,
              (SELECT count(*) FROM user_events
               WHERE received_at > COALESCE((SELECT watermark FROM job_state WHERE job_name = 'rollup'), 'epoch')) AS unprocessed_events`
    ),
  ]);
  return Response.json({
    data: { runs, watermarks: state, ingestion: { ...lag[0], unprocessed_events: Number(lag[0]?.unprocessed_events ?? 0) } },
  });
});
