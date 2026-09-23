import { getPool } from "@/lib/db/pool";
import { evaluateAlerts, type AlertStats } from "@/lib/jobs/alerts";
import { chunk, findDirty, type DirtyScope } from "@/lib/jobs/dirty";
import { rebuildBilling, rebuildUsers } from "@/lib/jobs/identity";
import {
  deriveCheckoutAbandoned,
  rebuildAutoApplyUsage,
  rebuildExperimentAssignments,
  rebuildMilestones,
  rollupDailyMetrics,
} from "@/lib/jobs/rollup";
import {
  PIPELINE_LOCK,
  readWatermark,
  runJob,
  WATERMARK_OVERLAP_MS,
  WATERMARK_SETTLE_MS,
  writeWatermark,
  type JobTrigger,
} from "@/lib/jobs/runner";
import { allUserIds, scoreUsers, usersChangedSince, type ScoringStats } from "@/lib/jobs/scoring";
import { closeIdleSessions, rebuildSessions } from "@/lib/jobs/sessions";
import { addDays, businessToday } from "@/lib/time/business-time";

// ---------------------------------------------------------------------------
// Job orchestration. Order matters and never changes:
//
//   ROLLUP STAGE   derive checkout_abandoned -> billing -> users -> sessions
//                  -> daily metrics -> milestones -> Auto Apply usage
//                  -> experiment assignments
//   SCORING STAGE  PQL + lifecycle + priority -> alert rules -> leads
//
// Schedules (lib/jobs/scheduler.ts):
//   pipeline  every 2 min   incremental rollup + scoring (near-real-time usage alerts)
//   sweep     hourly        rescore everyone: no-activity decay and dormancy are
//                           time-driven and never arrive as events
//   nightly   00:30 biz TZ  re-roll yesterday for late-arriving events
//
// All run under one advisory lock, so stages never interleave across instances.
// ---------------------------------------------------------------------------

const USER_BATCH = 1000;
const PAIR_BATCH = 5000;

export interface RollupStats {
  derived_abandoned_checkouts: number;
  users: number;
  user_days: number;
  sessions: number;
  sessions_closed: number;
  subscriptions: number;
  payments: number;
  milestones: number;
  usage_rows: number;
  experiment_assignments: number;
  window?: { lower: string; upper: string };
  range?: { from: string; to: string; user_id?: string };
}

async function dbNow(): Promise<Date> {
  return (await getPool().query<{ now: Date }>("SELECT now() AS now")).rows[0]!.now;
}

async function rollupStage(scope: DirtyScope): Promise<{ stats: RollupStats; dirtyUsers: string[] }> {
  const derived = await deriveCheckoutAbandoned();
  const dirty = await findDirty(scope);
  const stats: RollupStats = {
    derived_abandoned_checkouts: derived,
    users: dirty.users.length,
    user_days: dirty.userDates.length,
    sessions: 0,
    sessions_closed: 0,
    subscriptions: 0,
    payments: 0,
    milestones: 0,
    usage_rows: 0,
    experiment_assignments: 0,
  };

  for (const users of chunk(dirty.users, USER_BATCH)) {
    const billing = await rebuildBilling(users);
    stats.subscriptions += billing.subscriptions;
    stats.payments += billing.payments;
    await rebuildUsers(users);
  }
  for (const sessions of chunk(dirty.sessions, USER_BATCH)) stats.sessions += await rebuildSessions(sessions);
  stats.sessions_closed = await closeIdleSessions();
  for (const pairs of chunk(dirty.userDates, PAIR_BATCH)) await rollupDailyMetrics(pairs);
  for (const users of chunk(dirty.users, USER_BATCH)) {
    stats.milestones += await rebuildMilestones(users);
    stats.usage_rows += await rebuildAutoApplyUsage(users);
    stats.experiment_assignments += await rebuildExperimentAssignments(users);
  }
  return { stats, dirtyUsers: dirty.users };
}

async function incrementalRollup(): Promise<RollupStats> {
  const upper = new Date((await dbNow()).getTime() - WATERMARK_SETTLE_MS);
  const previous = await readWatermark("rollup");
  const lower = new Date(Math.max(0, previous.getTime() - WATERMARK_OVERLAP_MS));
  const { stats } = await rollupStage({ kind: "window", lower, upper });
  await writeWatermark("rollup", upper);
  return { ...stats, window: { lower: lower.toISOString(), upper: upper.toISOString() } };
}

async function incrementalScoring(): Promise<ScoringStats & { alerts: AlertStats }> {
  const upper = await dbNow();
  const previous = await readWatermark("scoring");
  const lower = new Date(Math.max(0, previous.getTime() - WATERMARK_OVERLAP_MS));
  const users = await usersChangedSince(lower, upper);
  const scoring = await scoreUsers(users);
  const alerts = await evaluateAlerts(users);
  await writeWatermark("scoring", upper);
  return { ...scoring, alerts };
}

async function fullScoring(): Promise<ScoringStats & { alerts: AlertStats }> {
  const users = await allUserIds();
  const scoring = await scoreUsers(users);
  const alerts = await evaluateAlerts(null);
  return { ...scoring, alerts };
}

// --------------------------------------------------------------------------- public entry points

/** Scheduled tick: incremental rollup, then incremental scoring. */
export function runPipeline(trigger: JobTrigger = "schedule") {
  return runJob(
    "pipeline",
    trigger,
    async () => ({ rollup: await incrementalRollup(), scoring: await incrementalScoring() }),
    { lock: PIPELINE_LOCK }
  );
}

/**
 * POST /api/internal/run-rollup. With no range: the incremental rollup (same as a
 * tick). With from/to (business dates) and optional user_id: a backfill that
 * recomputes exactly that slice and leaves watermarks alone.
 */
export function runRollup(trigger: JobTrigger, range?: { from: string; to: string; userId?: string }) {
  return runJob(
    "rollup",
    trigger,
    async (): Promise<RollupStats> => {
      if (!range) return incrementalRollup();
      const { stats } = await rollupStage({ kind: "range", ...range });
      return { ...stats, range: { from: range.from, to: range.to, ...(range.userId ? { user_id: range.userId } : {}) } };
    },
    { lock: PIPELINE_LOCK, waitMs: 60_000 }
  );
}

/** POST /api/internal/run-scoring. `all` rescored everyone (what the hourly sweep does). */
export function runScoring(trigger: JobTrigger, opts: { all?: boolean; userIds?: string[] } = {}) {
  return runJob(
    "scoring",
    trigger,
    async () => {
      if (opts.userIds?.length) {
        const scoring = await scoreUsers(opts.userIds);
        return { ...scoring, alerts: await evaluateAlerts(opts.userIds) };
      }
      return opts.all ? fullScoring() : incrementalScoring();
    },
    { lock: PIPELINE_LOCK, waitMs: 60_000 }
  );
}

export function runSweep(trigger: JobTrigger = "schedule") {
  return runJob("sweep", trigger, fullScoring, { lock: PIPELINE_LOCK });
}

/** Re-roll the previous business day once per day, after 00:30 business time. */
export async function runNightlyIfDue(trigger: JobTrigger = "schedule", now = new Date()) {
  const today = businessToday(now);
  const target = addDays(today, -1);
  const last = await getPool().query<{ d: string }>(
    "SELECT business_date(watermark)::text AS d FROM job_state WHERE job_name = 'nightly'"
  );
  if (last.rows[0]?.d && last.rows[0].d >= today) return { status: "skipped" as const, reason: "already ran today" };

  const minutesIntoDay = await getPool().query<{ m: number }>(
    "SELECT extract(epoch FROM now() - business_day_start(business_today()))::int / 60 AS m"
  );
  if ((minutesIntoDay.rows[0]?.m ?? 0) < 30) return { status: "skipped" as const, reason: "before 00:30" };

  const outcome = await runJob(
    "nightly",
    trigger,
    async () => {
      const { stats: rollup, dirtyUsers } = await rollupStage({ kind: "range", from: target, to: target });
      const scoring = await scoreUsers(dirtyUsers);
      return { date: target, rollup, scoring };
    },
    { lock: PIPELINE_LOCK }
  );
  if (outcome.status === "success") await writeWatermark("nightly", now);
  return outcome;
}
