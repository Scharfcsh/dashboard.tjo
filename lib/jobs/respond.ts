import type { JobOutcome } from "@/lib/jobs/runner";

/** 200 on success, 409 when another run holds the lock, 500 on failure. */
export function jobResponse<T>(outcome: JobOutcome<T>): Response {
  switch (outcome.status) {
    case "success":
      return Response.json({
        status: "success",
        run_id: outcome.runId,
        duration_ms: outcome.durationMs,
        stats: outcome.stats,
      });
    case "skipped":
      return Response.json(
        { error: { code: "CONFLICT", message: `Job did not run: ${outcome.reason}` } },
        { status: 409 }
      );
    case "failed":
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: outcome.error, details: { run_id: outcome.runId } } },
        { status: 500 }
      );
  }
}
