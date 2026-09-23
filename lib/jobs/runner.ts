import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/pool";

// ---------------------------------------------------------------------------
// Every background job runs through runJob():
//   * a session-level Postgres advisory lock, so N app instances (or a manual
//     trigger racing the scheduler) never run the same job concurrently;
//   * a job_runs row with status, stats and error for observability.
//
// The lock is held on a dedicated connection for the job's duration; the job
// itself uses the pool freely.
// ---------------------------------------------------------------------------

export type JobTrigger = "schedule" | "manual" | "test";

export type JobOutcome<T> =
  | { status: "success"; runId: number; stats: T; durationMs: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; runId: number; error: string; durationMs: number };

/** Lock namespace shared by all derived-state writers - they must not interleave. */
export const PIPELINE_LOCK = "pipeline";

async function tryLock(client: PoolClient, name: string): Promise<boolean> {
  const { rows } = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext('analytics:' || $1)) AS locked",
    [name]
  );
  return rows[0]!.locked;
}

export async function runJob<T>(
  jobName: string,
  trigger: JobTrigger,
  fn: () => Promise<T>,
  opts: { lock?: string; waitMs?: number } = {}
): Promise<JobOutcome<T>> {
  const lockName = opts.lock ?? jobName;
  const lockClient = await getPool().connect();
  try {
    let locked = await tryLock(lockClient, lockName);
    const deadline = Date.now() + (opts.waitMs ?? 0);
    while (!locked && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      locked = await tryLock(lockClient, lockName);
    }
    if (!locked) return { status: "skipped", reason: `lock "${lockName}" is held by another run` };

    const started = Date.now();
    const { rows } = await getPool().query<{ id: string }>(
      "INSERT INTO job_runs (job_name, status, trigger) VALUES ($1, 'running', $2) RETURNING id",
      [jobName, trigger]
    );
    const runId = Number(rows[0]!.id);

    try {
      const stats = await fn();
      const durationMs = Date.now() - started;
      await getPool().query(
        "UPDATE job_runs SET status = 'success', stats = $2, finished_at = now() WHERE id = $1",
        [runId, JSON.stringify({ ...(stats as object), duration_ms: durationMs })]
      );
      return { status: "success", runId, stats, durationMs };
    } catch (err) {
      const durationMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[jobs] ${jobName} failed`, err);
      await getPool()
        .query("UPDATE job_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1", [runId, message])
        .catch(() => {});
      return { status: "failed", runId, error: message, durationMs };
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext('analytics:' || $1))", [lockName]).catch(() => {});
    }
  } finally {
    lockClient.release();
  }
}

// ---------------------------------------------------------------------------
// Watermarks. Incremental jobs process rows *received* (not occurred) after
// the watermark, so late-arriving events are never skipped. Each run re-reads a
// small overlap: every derived write is a full recompute of its keys, so
// reprocessing is harmless, and the overlap covers transactions that committed
// with an earlier received_at than the previous watermark.
// ---------------------------------------------------------------------------

export const WATERMARK_OVERLAP_MS = 5 * 60 * 1000;
/** Do not read the last moments - rows may still be committing. */
export const WATERMARK_SETTLE_MS = 2 * 1000;

export async function readWatermark(jobName: string): Promise<Date> {
  const { rows } = await getPool().query<{ watermark: Date }>("SELECT watermark FROM job_state WHERE job_name = $1", [
    jobName,
  ]);
  return rows[0]?.watermark ?? new Date(0);
}

export async function writeWatermark(jobName: string, watermark: Date): Promise<void> {
  await getPool().query(
    `INSERT INTO job_state (job_name, watermark) VALUES ($1, $2)
     ON CONFLICT (job_name) DO UPDATE SET watermark = GREATEST(job_state.watermark, EXCLUDED.watermark), updated_at = now()`,
    [jobName, watermark]
  );
}
