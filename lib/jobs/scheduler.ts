import { getConfig } from "@/lib/config";
import { runNightlyIfDue, runPipeline, runSweep } from "@/lib/jobs/pipeline";

// In-process scheduler, started from instrumentation.ts when JOBS_ENABLED=true.
// Safe with several app instances: every job takes the pipeline advisory lock,
// and a tick that finds the lock held simply skips.

const PIPELINE_EVERY_MS = 2 * 60_000;
const SWEEP_EVERY_MS = 60 * 60_000;
const NIGHTLY_CHECK_EVERY_MS = 10 * 60_000;

const g = globalThis as unknown as { __analyticsSchedulerStarted?: boolean };

function every(name: string, ms: number, fn: () => Promise<unknown>) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = (await fn()) as { status?: string; error?: string } | undefined;
      if (result?.status === "failed") console.error(`[scheduler] ${name} failed: ${result.error}`);
    } catch (err) {
      console.error(`[scheduler] ${name} threw`, err);
    } finally {
      running = false;
    }
  };
  // Jitter the first run so instances started together do not collide on the lock.
  const first = setTimeout(tick, 5_000 + Math.floor(Math.random() * 15_000));
  const timer = setInterval(tick, ms);
  first.unref?.();
  timer.unref?.();
}

export function startScheduler() {
  if (g.__analyticsSchedulerStarted) return;
  if (getConfig().EVENTS_DATABASE_READ_ONLY) {
    console.warn("[scheduler] EVENTS_DATABASE_READ_ONLY is set - background jobs write, so they are not started");
    return;
  }
  g.__analyticsSchedulerStarted = true;
  every("pipeline", PIPELINE_EVERY_MS, () => runPipeline("schedule"));
  every("sweep", SWEEP_EVERY_MS, () => runSweep("schedule"));
  every("nightly", NIGHTLY_CHECK_EVERY_MS, () => runNightlyIfDue("schedule"));
  console.log("[scheduler] started: pipeline every 2m, sweep hourly, nightly re-rollup after 00:30 business time");
}
