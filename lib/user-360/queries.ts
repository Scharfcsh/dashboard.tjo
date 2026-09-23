import "server-only";
import { queryOne, queryRows } from "@/lib/db/pool";
import { eventDefinition } from "@/lib/events/catalog";
import { decodeCursor, keysetPage } from "@/lib/http/pagination";
import type { ApplicationRow, RawEventRow } from "@/lib/user-360/types";

// ---------------------------------------------------------------------------
// Queries the User 360 page needs beyond /api/users/:id/360.
// ---------------------------------------------------------------------------

interface AutoApplyEventRow {
  event_id: string;
  event_name: string;
  occurred_at: Date;
  properties: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

/**
 * One row per Auto Apply run, folded from its lifecycle events
 * (started -> success | failed | blocked). Manual apply clicks are listed too,
 * marked "manual", so the tab shows everything the user applied to.
 */
export function foldApplications(rows: AutoApplyEventRow[]): ApplicationRow[] {
  const byId = new Map<string, ApplicationRow>();
  const manual: ApplicationRow[] = [];

  for (const e of rows) {
    const p = e.properties ?? {};
    const at = e.occurred_at.toISOString();
    if (e.event_name === "apply_clicked" || e.event_name === "apply_completed") {
      manual.push({
        id: e.event_id,
        company: str(p.company),
        title: str(p.title),
        jobUrl: str(p.job_url),
        startedAt: at,
        finishedAt: null,
        outcome: "manual",
        reason: null,
        platform: str(p.mode) ?? "Manual apply",
      });
      continue;
    }
    const id = str(p.application_id) ?? str(p.run_id) ?? e.event_id;
    const existing = byId.get(id);
    const row: ApplicationRow = existing ?? {
      id,
      company: null,
      title: null,
      jobUrl: null,
      startedAt: at,
      finishedAt: null,
      outcome: "in_progress",
      reason: null,
      platform: null,
    };
    row.company ??= str(p.company);
    row.title ??= str(p.title);
    row.jobUrl ??= str(p.job_url);
    row.platform ??= str(p.platform);
    if (e.event_name === "auto_apply_started") row.startedAt = at;
    if (e.event_name === "auto_apply_success") {
      row.outcome = "submitted";
      row.finishedAt = at;
    }
    if (e.event_name === "auto_apply_failed") {
      row.outcome = "failed";
      row.finishedAt = at;
      row.reason = str(p.reason) ?? str(p.error_code);
    }
    if (e.event_name === "auto_apply_blocked") {
      row.outcome = "blocked";
      row.finishedAt = at;
      row.reason = str(p.reason) ?? "Free limit reached";
    }
    byId.set(id, row);
  }

  return [...byId.values(), ...manual].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export async function loadApplications(userId: string, limit = 200): Promise<ApplicationRow[]> {
  const rows = await queryRows<AutoApplyEventRow>(
    `SELECT event_id, event_name, occurred_at, properties FROM user_events
     WHERE user_id = $1 AND event_name IN ('auto_apply_started', 'auto_apply_success', 'auto_apply_failed',
                                           'auto_apply_blocked', 'apply_clicked', 'apply_completed')
     ORDER BY occurred_at DESC LIMIT $2`,
    [userId, limit * 4]
  );
  return foldApplications(rows.reverse()).slice(0, limit);
}

export interface MetricTrends {
  sessions: number;
  active_days: number;
  jobs_viewed: number;
  jobs_saved: number;
  apply_clicks: number;
  auto_apply_started: number;
  auto_apply_success: number;
  auto_apply_failed: number;
}

/** Sums for the last 30 business days and the 30 before that, for header trends. */
export async function loadTrends(userId: string): Promise<{ current: MetricTrends; previous: MetricTrends }> {
  const row = await queryOne<Record<string, number>>(
    `SELECT
       COALESCE(sum(sessions_count) FILTER (WHERE business_date > business_today() - 30), 0)::int AS c_sessions,
       COALESCE(sum(sessions_count) FILTER (WHERE business_date <= business_today() - 30), 0)::int AS p_sessions,
       count(*) FILTER (WHERE is_active AND business_date > business_today() - 30)::int AS c_active_days,
       count(*) FILTER (WHERE is_active AND business_date <= business_today() - 30)::int AS p_active_days,
       COALESCE(sum(jobs_viewed) FILTER (WHERE business_date > business_today() - 30), 0)::int AS c_jobs_viewed,
       COALESCE(sum(jobs_viewed) FILTER (WHERE business_date <= business_today() - 30), 0)::int AS p_jobs_viewed,
       COALESCE(sum(jobs_saved) FILTER (WHERE business_date > business_today() - 30), 0)::int AS c_jobs_saved,
       COALESCE(sum(jobs_saved) FILTER (WHERE business_date <= business_today() - 30), 0)::int AS p_jobs_saved,
       COALESCE(sum(apply_clicks) FILTER (WHERE business_date > business_today() - 30), 0)::int AS c_apply_clicks,
       COALESCE(sum(apply_clicks) FILTER (WHERE business_date <= business_today() - 30), 0)::int AS p_apply_clicks,
       COALESCE(sum(auto_apply_started) FILTER (WHERE business_date > business_today() - 30), 0)::int AS c_auto_apply_started,
       COALESCE(sum(auto_apply_started) FILTER (WHERE business_date <= business_today() - 30), 0)::int AS p_auto_apply_started,
       COALESCE(sum(auto_apply_success) FILTER (WHERE business_date > business_today() - 30), 0)::int AS c_auto_apply_success,
       COALESCE(sum(auto_apply_success) FILTER (WHERE business_date <= business_today() - 30), 0)::int AS p_auto_apply_success,
       COALESCE(sum(auto_apply_failed) FILTER (WHERE business_date > business_today() - 30), 0)::int AS c_auto_apply_failed,
       COALESCE(sum(auto_apply_failed) FILTER (WHERE business_date <= business_today() - 30), 0)::int AS p_auto_apply_failed
     FROM user_daily_metrics WHERE user_id = $1
       AND business_date > business_today() - 60`,
    [userId]
  );
  const pick = (prefix: "c" | "p"): MetricTrends => ({
    sessions: row?.[`${prefix}_sessions`] ?? 0,
    active_days: row?.[`${prefix}_active_days`] ?? 0,
    jobs_viewed: row?.[`${prefix}_jobs_viewed`] ?? 0,
    jobs_saved: row?.[`${prefix}_jobs_saved`] ?? 0,
    apply_clicks: row?.[`${prefix}_apply_clicks`] ?? 0,
    auto_apply_started: row?.[`${prefix}_auto_apply_started`] ?? 0,
    auto_apply_success: row?.[`${prefix}_auto_apply_success`] ?? 0,
    auto_apply_failed: row?.[`${prefix}_auto_apply_failed`] ?? 0,
  });
  return { current: pick("c"), previous: pick("p") };
}

export interface ProfileExtras {
  signupDevice: string | null;
  currentDevice: string | null;
  resumeScore: number | null;
  resumeScoreTracked: boolean;
  tailoringUses: number;
  coverLetters: number | null;
  proClicks: number;
  premiumClicks: number;
  paymentAttempts: number;
  lastPlanClicked: string | null;
  errors7d: number;
  blocked: number;
  autoApplyFailuresLifetime: number;
}

/** Device history, resume/AI usage and plan-click detail that the 360 API does not expose. */
export async function loadExtras(userId: string): Promise<ProfileExtras> {
  const [devices, events, coverTracked, scoreTracked] = await Promise.all([
    queryOne<{ first_device: string | null; current_device: string | null }>(
      `SELECT (array_agg(concat_ws(' ', initcap(device_type), browser) ORDER BY started_at))[1] AS first_device,
              (array_agg(concat_ws(' ', initcap(device_type), browser) ORDER BY started_at DESC))[1] AS current_device
       FROM user_sessions WHERE user_id = $1 AND device_type IS NOT NULL`,
      [userId]
    ),
    queryOne<Record<string, number | string | null>>(
      `SELECT
         count(*) FILTER (WHERE event_name = 'resume_tailored')::int AS tailoring,
         count(*) FILTER (WHERE event_name = 'cover_letter_generated')::int AS cover_letters,
         count(*) FILTER (WHERE event_name = 'pro_clicked')::int AS pro_clicks,
         count(*) FILTER (WHERE event_name = 'premium_clicked')::int AS premium_clicks,
         count(*) FILTER (WHERE event_name IN ('payment_started', 'payment_success', 'payment_failed'))::int AS payment_attempts,
         count(*) FILTER (WHERE event_name IN ('error_shown', 'resume_parse_failed')
                            AND occurred_at > now() - interval '7 days')::int AS errors_7d,
         count(*) FILTER (WHERE event_name = 'auto_apply_blocked')::int AS blocked,
         count(*) FILTER (WHERE event_name = 'auto_apply_failed')::int AS failures_lifetime,
         (array_agg(properties->>'score' ORDER BY occurred_at DESC)
            FILTER (WHERE event_name = 'resume_analyzed' AND properties ? 'score'))[1] AS resume_score,
         (array_agg(event_name ORDER BY occurred_at DESC)
            FILTER (WHERE event_name IN ('pro_clicked', 'premium_clicked')))[1] AS last_plan_clicked
       FROM user_events WHERE user_id = $1`,
      [userId]
    ),
    // Distinguish "zero" from "the app never sends this event".
    queryOne<{ tracked: boolean }>("SELECT EXISTS (SELECT 1 FROM user_events WHERE event_name = 'cover_letter_generated') AS tracked"),
    queryOne<{ tracked: boolean }>("SELECT EXISTS (SELECT 1 FROM user_events WHERE event_name = 'resume_analyzed' AND properties ? 'score') AS tracked"),
  ]);

  const score = events?.resume_score;
  return {
    signupDevice: devices?.first_device || null,
    currentDevice: devices?.current_device || null,
    resumeScore: score === null || score === undefined ? null : Number(score),
    resumeScoreTracked: scoreTracked?.tracked ?? false,
    tailoringUses: Number(events?.tailoring ?? 0),
    coverLetters: coverTracked?.tracked ? Number(events?.cover_letters ?? 0) : null,
    proClicks: Number(events?.pro_clicks ?? 0),
    premiumClicks: Number(events?.premium_clicks ?? 0),
    paymentAttempts: Number(events?.payment_attempts ?? 0),
    lastPlanClicked: (events?.last_plan_clicked as string | null) ?? null,
    errors7d: Number(events?.errors_7d ?? 0),
    blocked: Number(events?.blocked ?? 0),
    autoApplyFailuresLifetime: Number(events?.failures_lifetime ?? 0),
  };
}

/** Engineer-facing raw event list (keyset paginated). */
export async function loadRawEvents(userId: string, cursor?: string, limit = 40) {
  const c = decodeCursor(cursor);
  const params: unknown[] = [userId, limit + 1];
  let extra = "";
  if (c) {
    params.push(c.ts, c.id);
    extra = " AND (occurred_at, event_id) < ($3::timestamptz, $4)";
  }
  const rows = await queryRows<{
    event_id: string;
    event_name: string;
    occurred_at: Date;
    page: string | null;
    ingest_source: string;
    properties: Record<string, unknown>;
  }>(
    `SELECT event_id, event_name, occurred_at, page, ingest_source, properties FROM user_events
     WHERE user_id = $1${extra}
     ORDER BY occurred_at DESC, event_id DESC LIMIT $2`,
    params
  );
  const page = keysetPage(rows, limit, (r) => [r.occurred_at, r.event_id]);
  return {
    rows: page.data.map(
      (r): RawEventRow => ({
        id: r.event_id,
        name: r.event_name,
        label: eventDefinition(r.event_name).label || r.event_name,
        at: r.occurred_at.toISOString(),
        page: r.page,
        source: r.ingest_source,
        properties: r.properties ?? {},
      })
    ),
    nextCursor: page.page.next_cursor,
  };
}
