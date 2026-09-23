import { queryOne, queryRows } from "@/lib/db/pool";
import { FEATURES } from "@/lib/events/catalog";
import { definitionsFor, pct } from "@/lib/metrics/definitions";
import { filterMeta, userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import { businessTimezone, rangeMeta, type DateRange } from "@/lib/time/business-time";

// ---------------------------------------------------------------------------
// Dashboard 7 - Growth, Activation & Retention Intelligence (SOP section 14).
// Aggregates only; no individual lead names (SOP acceptance criteria).
//
// Retention (one definition, used everywhere here): a user is retained on day N
// if they were active (>= 1 meaningful event) on business date signup_date + N.
// A cell is null until day N is complete for every member of the cohort.
// ---------------------------------------------------------------------------

export const RETENTION_DAYS = [0, 1, 3, 7, 14, 30] as const;

const ACTIVATION_STAGES = [
  { stage: "signed_up", milestone: "signup" },
  { stage: "onboarded", milestone: "onboarded" },
  { stage: "resume_uploaded", milestone: "resume_uploaded" },
  { stage: "first_auto_apply", milestone: "first_auto_apply" },
  { stage: "first_value", milestone: "first_auto_apply_success" },
  { stage: "activated", milestone: "activated" },
] as const;

/** Cohort = users who signed up in the range. Stages reached any time since signup. */
export async function activationFunnel(range: DateRange, f: UserFilters) {
  const p: unknown[] = [range.startUtc, range.endUtc, ACTIVATION_STAGES.map((s) => s.milestone)];
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{ user_id: string; milestones: string[] | null; ttfv_seconds: number | null }>(
    `SELECT u.user_id,
            array_agg(m.milestone) FILTER (WHERE m.milestone IS NOT NULL) AS milestones,
            extract(epoch FROM (
              (SELECT fv.first_at FROM user_milestones fv WHERE fv.user_id = u.user_id AND fv.milestone = 'first_auto_apply_success')
              - u.signup_at))::float8 AS ttfv_seconds
     FROM users u
     LEFT JOIN user_milestones m ON m.user_id = u.user_id AND m.milestone = ANY($3::text[])
     WHERE u.signup_at >= $1 AND u.signup_at < $2${filter}
     GROUP BY u.user_id, u.signup_at`,
    p
  );

  const nested = ACTIVATION_STAGES.map(() => 0);
  const ttfv: number[] = [];
  for (const r of rows) {
    const have = new Set(r.milestones ?? []);
    have.add("signup"); // cohort membership is signup
    let chain = true;
    ACTIVATION_STAGES.forEach((s, i) => {
      chain = chain && have.has(s.milestone);
      if (chain) nested[i]!++;
    });
    if (r.ttfv_seconds !== null && r.ttfv_seconds >= 0) ttfv.push(r.ttfv_seconds);
  }

  const stages = ACTIVATION_STAGES.map((s, i) => {
    const prev = i === 0 ? null : nested[i - 1]!;
    const conversion = prev === null ? null : pct(nested[i]!, prev);
    return {
      stage: s.stage,
      users: nested[i]!,
      conversion_from_previous_pct: conversion,
      drop_off_pct: conversion === null ? null : Math.round((100 - conversion) * 10) / 10,
      conversion_from_signup_pct: pct(nested[i]!, nested[0]!),
    };
  });
  const leak = stages.slice(1).reduce<(typeof stages)[number] | null>(
    (worst, s) => (s.drop_off_pct !== null && (!worst || s.drop_off_pct > (worst.drop_off_pct ?? -1)) ? s : worst),
    null
  );

  ttfv.sort((a, b) => a - b);
  const buckets = [
    { bucket: "under_5_min", max: 300 },
    { bucket: "5_to_15_min", max: 900 },
    { bucket: "15_to_60_min", max: 3600 },
    { bucket: "1_to_24_hours", max: 86_400 },
    { bucket: "over_24_hours", max: Infinity },
  ];
  let lower = 0;
  const distribution = buckets.map((b) => {
    const users = ttfv.filter((t) => t >= lower && t < b.max).length;
    lower = b.max;
    return { bucket: b.bucket, users, share_pct: pct(users, ttfv.length) };
  });

  return {
    data: {
      cohort_size: rows.length,
      stages,
      largest_drop_off: leak ? { stage: leak.stage, drop_off_pct: leak.drop_off_pct } : null,
      time_to_first_value: {
        users_reached: ttfv.length,
        median_seconds: ttfv.length ? Math.round(ttfv[Math.floor((ttfv.length - 1) / 2)]!) : null,
        distribution,
      },
    },
    meta: {
      ...rangeMeta(range),
      filters: filterMeta(f),
      cohort: "Users whose signup_at is in the range (users without a known signup date are excluded).",
      funnel_logic: "Nested: each stage requires every earlier stage. First value = first successful Auto Apply.",
      time_to_first_value: "first_auto_apply_success milestone minus signup_at; first qualifying event only.",
    },
    definitions: definitionsFor(["activated_users", "new_users"]),
  };
}

export async function retentionCohorts(weeks: number, f: UserFilters) {
  const p: unknown[] = [weeks, RETENTION_DAYS];
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{
    cohort_week: string;
    size: number;
    last_signup_date: string;
    day: number;
    retained: number;
    complete: boolean;
  }>(
    `WITH cohort AS (
       SELECT u.user_id, business_date(u.signup_at) AS signup_date,
              date_trunc('week', business_date(u.signup_at))::date AS cohort_week
       FROM users u
       WHERE u.signup_at IS NOT NULL
         AND business_date(u.signup_at) >= date_trunc('week', business_today())::date - ($1::int - 1) * 7${filter}
     ),
     sizes AS (
       SELECT cohort_week, count(*) AS size, max(signup_date) AS last_signup_date FROM cohort GROUP BY cohort_week
     )
     SELECT s.cohort_week::text, s.size, s.last_signup_date::text, d.day,
            count(DISTINCT m.user_id) AS retained,
            (s.last_signup_date + d.day < business_today()) AS complete
     FROM sizes s
     CROSS JOIN unnest($2::int[]) AS d(day)
     LEFT JOIN cohort c ON c.cohort_week = s.cohort_week
     LEFT JOIN user_daily_metrics m ON m.user_id = c.user_id AND m.business_date = c.signup_date + d.day AND m.is_active
     GROUP BY s.cohort_week, s.size, s.last_signup_date, d.day
     ORDER BY s.cohort_week DESC, d.day`,
    p
  );

  const cohorts = new Map<string, { cohort_week: string; size: number; retention: Record<string, unknown> }>();
  for (const r of rows) {
    const c = cohorts.get(r.cohort_week) ?? { cohort_week: r.cohort_week, size: r.size, retention: {} };
    c.retention[`d${r.day}`] = r.complete ? { retained: r.retained, pct: pct(r.retained, r.size) } : null;
    cohorts.set(r.cohort_week, c);
  }
  return {
    data: { days: RETENTION_DAYS, cohorts: [...cohorts.values()] },
    meta: {
      weeks,
      timezone: businessTimezone(),
      filters: filterMeta(f),
      cohort: "Signup week (Monday start, business timezone). Users without a known signup date are excluded.",
    },
    definitions: definitionsFor(["retention_dn"]),
  };
}

export async function acquisitionQuality(range: DateRange, f: UserFilters) {
  const p: unknown[] = [range.startUtc, range.endUtc];
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{
    source: string;
    signups: number;
    activated_7d: number;
    d7_eligible: number;
    d7_retained: number;
    paid: number;
    avg_pql_score: number | null;
  }>(
    `SELECT COALESCE(lower(u.acq_source), 'unknown') AS source,
            count(*) AS signups,
            count(*) FILTER (WHERE a.first_at <= u.signup_at + interval '7 days') AS activated_7d,
            count(*) FILTER (WHERE business_date(u.signup_at) + 7 < business_today()) AS d7_eligible,
            count(*) FILTER (WHERE business_date(u.signup_at) + 7 < business_today() AND EXISTS (
              SELECT 1 FROM user_daily_metrics d
              WHERE d.user_id = u.user_id AND d.is_active AND d.business_date = business_date(u.signup_at) + 7
            )) AS d7_retained,
            count(*) FILTER (WHERE pd.first_at IS NOT NULL) AS paid,
            round(avg(ps.score), 1)::float8 AS avg_pql_score
     FROM users u
     LEFT JOIN user_milestones a ON a.user_id = u.user_id AND a.milestone = 'activated'
     LEFT JOIN user_milestones pd ON pd.user_id = u.user_id AND pd.milestone = 'first_paid'
     LEFT JOIN pql_scores ps ON ps.user_id = u.user_id
     WHERE u.signup_at >= $1 AND u.signup_at < $2${filter}
     GROUP BY 1
     ORDER BY signups DESC`,
    p
  );
  return {
    data: {
      sources: rows.map((r) => ({
        source: r.source,
        signups: r.signups,
        activation_rate_7d_pct: pct(r.activated_7d, r.signups),
        d7_retention_pct: pct(r.d7_retained, r.d7_eligible),
        d7_eligible_users: r.d7_eligible,
        paid_users: r.paid,
        paid_rate_pct: pct(r.paid, r.signups),
        avg_pql_score: r.avg_pql_score,
      })),
    },
    meta: {
      ...rangeMeta(range),
      filters: filterMeta(f),
      definitions: {
        source: "First-touch acquisition source (identify traits, else first browser event's utm_source).",
        activation_rate_7d_pct: "Share of signups that reached 'activated' within 7 days of signup.",
        d7_retention_pct: "Share of signups (whose day 7 is complete) active on signup date + 7.",
        paid_rate_pct: "Share of signups with a first_paid milestone (any time).",
      },
    },
    definitions: definitionsFor(["activated_users", "retention_dn"]),
  };
}

/**
 * Feature adoption among users who signed up in the range and are at least 30
 * days old (so retention is observable). Adopter = first used the feature within
 * 7 days of signup. Retained = active on any day 22-30 after signup (week-4 retention).
 */
export async function featureAdoption(range: DateRange, f: UserFilters) {
  const p: unknown[] = [range.startUtc, range.endUtc, FEATURES.map((x) => `feature:${x}`)];
  const filter = userFilterSql(f, p);
  const baseParams: unknown[] = [range.startUtc, range.endUtc];
  const base = await queryOne<{ n: number }>(
    `SELECT count(*) AS n FROM users u
     WHERE u.signup_at >= $1 AND u.signup_at < $2 AND business_date(u.signup_at) + 30 < business_today()${userFilterSql(f, baseParams)}`,
    baseParams
  );
  const rows = await queryRows<{ feature: string; adopters: number; adopters_retained: number; non_adopters: number; non_adopters_retained: number; ever_used: number }>(
    `WITH pop AS (
       SELECT u.user_id, u.signup_at,
              EXISTS (SELECT 1 FROM user_daily_metrics d WHERE d.user_id = u.user_id AND d.is_active
                        AND d.business_date BETWEEN business_date(u.signup_at) + 22 AND business_date(u.signup_at) + 30) AS retained
       FROM users u
       WHERE u.signup_at >= $1 AND u.signup_at < $2 AND business_date(u.signup_at) + 30 < business_today()${filter}
     )
     SELECT substr(fm.feature, 9) AS feature,
            count(*) FILTER (WHERE m.first_at <= pop.signup_at + interval '7 days')                       AS adopters,
            count(*) FILTER (WHERE m.first_at <= pop.signup_at + interval '7 days' AND pop.retained)      AS adopters_retained,
            count(*) FILTER (WHERE m.first_at IS NULL OR m.first_at > pop.signup_at + interval '7 days')  AS non_adopters,
            count(*) FILTER (WHERE (m.first_at IS NULL OR m.first_at > pop.signup_at + interval '7 days') AND pop.retained) AS non_adopters_retained,
            count(*) FILTER (WHERE m.first_at IS NOT NULL)                                                AS ever_used
     FROM unnest($3::text[]) AS fm(feature)
     CROSS JOIN pop
     LEFT JOIN user_milestones m ON m.user_id = pop.user_id AND m.milestone = fm.feature
     GROUP BY fm.feature
     ORDER BY adopters DESC`,
    p
  );
  const population = base?.n ?? 0;
  return {
    data: {
      population,
      features: rows.map((r) => {
        const adopterRetention = pct(r.adopters_retained, r.adopters);
        const otherRetention = pct(r.non_adopters_retained, r.non_adopters);
        return {
          feature: r.feature,
          adoption_7d_pct: pct(r.adopters, population),
          ever_used_pct: pct(r.ever_used, population),
          adopters: r.adopters,
          retention_adopters_pct: adopterRetention,
          retention_non_adopters_pct: otherRetention,
          retention_lift_pp:
            adopterRetention === null || otherRetention === null ? null : Math.round((adopterRetention - otherRetention) * 10) / 10,
        };
      }),
    },
    meta: {
      ...rangeMeta(range),
      filters: filterMeta(f),
      population: "Users who signed up in the range and are at least 30 days past signup.",
      adopter: "Used the feature (first meaningful event in that product area) within 7 days of signup.",
      retained: "Active on any business date 22-30 days after signup.",
      retention_lift_pp: "Retention of adopters minus non-adopters, in percentage points. Correlation, not causation.",
    },
  };
}
