import "server-only";
import { queryOne, queryRows } from "@/lib/db/pool";
import { AUTO_APPLY_THRESHOLDS } from "@/lib/events/catalog";
import { OPEN_LEAD_SQL } from "@/lib/jobs/sql";
import { definitionsFor, pct } from "@/lib/metrics/definitions";
import { filterMeta, userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import { HOT_PQL_MIN_SCORE, MONETIZATION_SIGNAL_RULES, PQL_CATEGORIES, PQL_RULES_VERSION } from "@/lib/scoring/pql-config";
import { rangeMeta, type DateRange } from "@/lib/time/business-time";
import { formatUserSummary, USER_SUMMARY_COLUMNS, USER_SUMMARY_JOINS, type UserSummaryRow } from "@/lib/users/summary";
import { withUserDetails } from "@/lib/user-details";

// Dashboard 4 - PQL & Auto Apply Monetization Intelligence (SOP section 11).

export const USAGE_STAGES = [
  { stage: "0-10", label: "Early users", min: 0, max: 10 },
  { stage: "11-25", label: "Developing value", min: 11, max: 25 },
  { stage: "26-39", label: "Engaged", min: 26, max: 39 },
  { stage: "40-44", label: "Warm", min: 40, max: 44 },
  { stage: "45-49", label: "Hot", min: 45, max: 49 },
  { stage: "50", label: "Immediate upgrade opportunity", min: 50, max: null },
] as const;

export async function usageStages(f: UserFilters, includePaid: boolean) {
  const p: unknown[] = [];
  const filter = userFilterSql(f, p);
  const paid = includePaid ? "" : " AND NOT is_paid_user(a.user_id)";
  const rows = await queryRows<{ stage: string; users: string }>(
    `SELECT CASE WHEN a.used >= 50 THEN '50' WHEN a.used >= 45 THEN '45-49' WHEN a.used >= 40 THEN '40-44'
                 WHEN a.used >= 26 THEN '26-39' WHEN a.used >= 11 THEN '11-25' ELSE '0-10' END AS stage,
            count(*) AS users
     FROM auto_apply_usage a JOIN users u ON u.user_id = a.user_id
     WHERE (a.started_total > 0 OR a.used > 0)${paid}${filter}
     GROUP BY 1`,
    p
  );
  const p2: unknown[] = [];
  const neverStarted = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM auto_apply_usage a WHERE a.user_id = u.user_id AND (a.started_total > 0 OR a.used > 0))
       ${includePaid ? "" : "AND NOT is_paid_user(u.user_id)"}${userFilterSql(f, p2)}`,
    p2
  );

  const counts = new Map(rows.map((r) => [r.stage, Number(r.users)]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return {
    data: {
      stages: USAGE_STAGES.map((s) => ({
        ...s,
        users: counts.get(s.stage) ?? 0,
        share_pct: pct(counts.get(s.stage) ?? 0, total),
      })),
      users_with_usage: total,
      users_never_started: Number(neverStarted?.n ?? 0),
    },
    meta: { filters: filterMeta(f), include_paid: includePaid, snapshot: true },
    definitions: definitionsFor(["usage_stage", "auto_apply_used", "paid_users"]),
  };
}

const MONETIZATION_STAGES = [
  { stage: "started_auto_apply", milestone: "first_auto_apply" },
  ...[10, 25, 40, 45, 50].map((t) => ({ stage: `used_${t}`, milestone: `aa_${t}` })),
  { stage: "pricing_viewed", milestone: "first_pricing_view" },
  { stage: "checkout_started", milestone: "first_checkout" },
  { stage: "paid", milestone: "first_paid" },
];

/** Cohort: users whose first Auto Apply is in the range. Each stage requires every earlier one. */
export async function monetizationFunnel(range: DateRange, f: UserFilters) {
  const p: unknown[] = [range.startUtc, range.endUtc, MONETIZATION_STAGES.map((s) => s.milestone)];
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{ user_id: string; milestones: string[] }>(
    `SELECT c.user_id, array_agg(m.milestone) AS milestones
     FROM user_milestones c
     JOIN users u ON u.user_id = c.user_id
     JOIN user_milestones m ON m.user_id = c.user_id AND m.milestone = ANY($3::text[])
     WHERE c.milestone = 'first_auto_apply' AND c.first_at >= $1 AND c.first_at < $2${filter}
     GROUP BY c.user_id`,
    p
  );

  const nested = MONETIZATION_STAGES.map(() => 0);
  const independent = MONETIZATION_STAGES.map(() => 0);
  for (const r of rows) {
    const have = new Set(r.milestones);
    let chain = true;
    MONETIZATION_STAGES.forEach((s, i) => {
      const reached = have.has(s.milestone);
      if (reached) independent[i]!++;
      chain = chain && reached;
      if (chain) nested[i]!++;
    });
  }

  const drops: { stage: string; drop_pct: number }[] = [];
  const stages = MONETIZATION_STAGES.map((s, i) => {
    const prev = i === 0 ? null : nested[i - 1]!;
    const conversion = prev === null ? null : pct(nested[i]!, prev);
    if (conversion !== null && prev !== null && prev > 0) {
      drops.push({ stage: s.stage, drop_pct: Math.round((100 - conversion) * 10) / 10 });
    }
    return {
      stage: s.stage,
      users: nested[i]!,
      independent_users: independent[i]!,
      conversion_from_previous_pct: conversion,
      conversion_from_start_pct: pct(nested[i]!, nested[0]!),
    };
  });

  const biggestDrop = drops.reduce<{ stage: string; drop_pct: number } | null>(
    (worst, d) => (worst === null || d.drop_pct > worst.drop_pct ? d : worst),
    null
  );

  return {
    data: { stages, biggest_drop_off: biggestDrop },
    meta: {
      ...rangeMeta(range),
      filters: filterMeta(f),
      cohort: "Users whose first Auto Apply run started inside the range; stages reached at any time since.",
      funnel_logic: "Nested: each stage counts cohort users who reached it and every earlier stage.",
    },
    definitions: definitionsFor(["auto_apply_used", "pricing_visitors", "checkout_started", "paid_conversions"]),
  };
}

/**
 * Conversion by usage milestone. For each threshold: unpaid users who reached it
 * in the range, and how many paid within `windowDays` of reaching it. Exposure
 * uses upgrade_prompt_shown events (trigger auto_apply_<N> or <N>) when the main
 * app sends them; otherwise reaching the milestone is the exposure proxy.
 */
export async function triggerEffectiveness(range: DateRange, f: UserFilters, windowDays: number) {
  const thresholds = AUTO_APPLY_THRESHOLDS as readonly number[];
  const p: unknown[] = [range.startUtc, range.endUtc, windowDays, thresholds];
  const filter = userFilterSql(f, p);

  const hasPromptData = await queryOne<{ any: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM user_milestones WHERE milestone LIKE 'upgrade\\_prompt:%') AS any"
  );

  const rows = await queryRows<{
    threshold: number;
    reached: string;
    exposed: string;
    pricing_after: string;
    checkout_after: string;
    converted: string;
    converted_exposed: string;
    converted_unexposed: string;
    window_open: string;
  }>(
    `WITH reach AS (
       SELECT t.threshold, m.user_id, m.first_at AS reached_at,
              paid.first_at AS paid_at,
              prompt.first_at AS prompt_at,
              pricing.last_at AS pricing_at,
              checkout.last_at AS checkout_at
       FROM unnest($4::int[]) AS t(threshold)
       JOIN user_milestones m ON m.milestone = 'aa_' || t.threshold AND m.first_at >= $1 AND m.first_at < $2
       JOIN users u ON u.user_id = m.user_id
       LEFT JOIN user_milestones paid ON paid.user_id = m.user_id AND paid.milestone = 'first_paid'
       LEFT JOIN LATERAL (
         SELECT min(p.first_at) AS first_at FROM user_milestones p
         WHERE p.user_id = m.user_id
           AND p.milestone IN ('upgrade_prompt:auto_apply_' || t.threshold, 'upgrade_prompt:' || t.threshold)
       ) prompt ON true
       -- Pricing / checkout activity ON OR AFTER the threshold: the response the
       -- trigger produced, not intent the user had shown long before it.
       LEFT JOIN LATERAL (
         SELECT max(d.business_date) AS last_at FROM user_daily_metrics d
         WHERE d.user_id = m.user_id AND d.pricing_views > 0 AND d.business_date >= business_date(m.first_at)
       ) pricing ON true
       LEFT JOIN LATERAL (
         SELECT max(d.business_date) AS last_at FROM user_daily_metrics d
         WHERE d.user_id = m.user_id AND d.checkout_started > 0 AND d.business_date >= business_date(m.first_at)
       ) checkout ON true
       WHERE (paid.first_at IS NULL OR paid.first_at > m.first_at)${filter}
     )
     SELECT threshold,
            count(*) AS reached,
            count(*) FILTER (WHERE prompt_at IS NOT NULL) AS exposed,
            count(*) FILTER (WHERE pricing_at IS NOT NULL) AS pricing_after,
            count(*) FILTER (WHERE checkout_at IS NOT NULL) AS checkout_after,
            count(*) FILTER (WHERE paid_at <= reached_at + make_interval(days => $3)) AS converted,
            count(*) FILTER (WHERE prompt_at IS NOT NULL AND paid_at <= reached_at + make_interval(days => $3)) AS converted_exposed,
            count(*) FILTER (WHERE prompt_at IS NULL AND paid_at <= reached_at + make_interval(days => $3)) AS converted_unexposed,
            count(*) FILTER (WHERE paid_at IS NULL AND reached_at + make_interval(days => $3) > now()) AS window_open
     FROM reach GROUP BY threshold ORDER BY threshold`,
    p
  );
  const byThreshold = new Map(rows.map((r) => [Number(r.threshold), r]));
  const promptData = hasPromptData?.any ?? false;

  return {
    data: {
      exposure_basis: (promptData ? "upgrade_prompt_shown" : "milestone_reached") as
        | "upgrade_prompt_shown"
        | "milestone_reached",
      triggers: thresholds.map((t) => {
        const r = byThreshold.get(t);
        const reached = Number(r?.reached ?? 0);
        const exposed = promptData ? Number(r?.exposed ?? 0) : reached;
        const converted = Number(r?.converted ?? 0);
        return {
          trigger: `auto_apply_${t}`,
          threshold: t,
          users_reached: reached,
          users_exposed: exposed,
          users_unexposed: promptData ? reached - exposed : null,
          pricing_viewed_after: Number(r?.pricing_after ?? 0),
          checkout_started_after: Number(r?.checkout_after ?? 0),
          converted_within_window: converted,
          conversion_rate_pct: pct(converted, reached),
          exposed_conversion_rate_pct: promptData ? pct(Number(r?.converted_exposed ?? 0), exposed) : pct(converted, reached),
          unexposed_conversion_rate_pct: promptData ? pct(Number(r?.converted_unexposed ?? 0), reached - exposed) : null,
          users_with_window_still_open: Number(r?.window_open ?? 0),
        };
      }),
    },
    meta: {
      ...rangeMeta(range),
      filters: filterMeta(f),
      conversion_window_days: windowDays,
      definition:
        "Users (unpaid when they reached the threshold) who reached each usage milestone inside the range; converted = first payment within the window after reaching it. users_with_window_still_open have not converted yet but still can. pricing_viewed_after / checkout_started_after count users with pricing or checkout activity on or after the day they hit the threshold.",
    },
  };
}

// --------------------------------------------------------------------------- critical revenue signals

/** `focus` names the lead-table filter each card applies when clicked. */
export const CRITICAL_SIGNALS = [
  { key: "quota_unpaid", label: "50/50 + Not Paid", caption: "Reached the limit, not converted", focus: "quota" },
  { key: "near_limit_pricing", label: "45+ + Pricing Viewed", caption: "High purchase intent", focus: "usage45" },
  { key: "checkout_abandoned", label: "Checkout Abandoned", caption: "Started checkout, did not finish", focus: "checkout" },
  { key: "payment_failed", label: "Payment Failed", caption: "Payment error, retry needed", focus: "payment_failed" },
  { key: "hot_unassigned", label: "Hot PQLs Unassigned", caption: "Needs a sales owner", focus: "unassigned" },
  { key: "converted_after_limit", label: "Converted After Limit", caption: "Paid after reaching 50", focus: null },
] as const;

export type CriticalSignalKey = (typeof CRITICAL_SIGNALS)[number]["key"];

/**
 * The six "act today" counts. Everything except `converted_after_limit` counts
 * unpaid users only - a paying customer is not an upgrade opportunity.
 */
export async function criticalSignals(f: UserFilters) {
  const p: unknown[] = [HOT_PQL_MIN_SCORE];
  const filter = userFilterSql(f, p);
  const row = await queryOne<Record<CriticalSignalKey, string>>(
    `SELECT
       count(*) FILTER (WHERE NOT paid AND aau.used >= aau.usage_limit)                        AS quota_unpaid,
       count(*) FILTER (WHERE NOT paid AND aau.used >= 45 AND COALESCE((ps.facts->>'pricingViews30d')::int, 0) > 0)
                                                                                               AS near_limit_pricing,
       count(*) FILTER (WHERE NOT paid AND COALESCE((ps.facts->>'checkoutAbandoned7d')::boolean, false))
                                                                                               AS checkout_abandoned,
       count(*) FILTER (WHERE NOT paid AND COALESCE((ps.facts->>'paymentFailedUnresolved')::boolean, false))
                                                                                               AS payment_failed,
       count(*) FILTER (WHERE NOT paid AND ps.score >= $1 AND lead.id IS NULL)                  AS hot_unassigned,
       count(*) FILTER (WHERE m50.first_at IS NOT NULL AND paid_at.first_at > m50.first_at)     AS converted_after_limit
     FROM users u
     LEFT JOIN auto_apply_usage aau  ON aau.user_id = u.user_id
     LEFT JOIN pql_scores ps         ON ps.user_id = u.user_id
     LEFT JOIN user_milestones m50   ON m50.user_id = u.user_id AND m50.milestone = 'aa_50'
     LEFT JOIN user_milestones paid_at ON paid_at.user_id = u.user_id AND paid_at.milestone = 'first_paid'
     LEFT JOIN LATERAL (
       SELECT l.id FROM sales_leads l
       WHERE l.user_id = u.user_id AND l.owner_id IS NOT NULL AND l.status IN ${OPEN_LEAD_SQL} LIMIT 1
     ) lead ON true
     CROSS JOIN LATERAL (SELECT is_paid_user(u.user_id) AS paid) pd
     WHERE true${filter}`,
    p
  );
  return {
    data: {
      signals: CRITICAL_SIGNALS.map((s) => ({ ...s, value: Number(row?.[s.key] ?? 0) })),
    },
    meta: { filters: filterMeta(f), snapshot: true, excludes_paid: "every signal except converted_after_limit" },
    definitions: definitionsFor(["quota_exhausted", "checkout_abandoned", "hot_pqls", "converted_after_limit"]),
  };
}

// --------------------------------------------------------------------------- PQL distribution

/** Users per PQL band. Bands come from PQL_CATEGORIES, never from a literal here. */
export async function pqlDistribution(f: UserFilters, includePaid: boolean) {
  const p: unknown[] = [];
  const paid = includePaid ? "" : " AND NOT is_paid_user(u.user_id)";
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{ category: string; users: string }>(
    `SELECT COALESCE(ps.category, 'early') AS category, count(*) AS users
     FROM users u JOIN pql_scores ps ON ps.user_id = u.user_id
     WHERE true${paid}${filter}
     GROUP BY 1`,
    p
  );
  const counts = new Map(rows.map((r) => [r.category, Number(r.users)]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return {
    data: {
      total_pqls: total,
      bands: PQL_CATEGORIES.map((c) => ({
        category: c.category,
        label: c.label,
        min: c.min,
        users: counts.get(c.category) ?? 0,
        share_pct: pct(counts.get(c.category) ?? 0, total),
      })),
    },
    meta: { filters: filterMeta(f), include_paid: includePaid, snapshot: true },
    definitions: definitionsFor(["pql_band"]),
  };
}

// --------------------------------------------------------------------------- why users become PQLs

/**
 * How many users each scoring rule currently fires for, read from the stored
 * `pql_scores.reasons`. Negative rules (inactivity penalties) are excluded -
 * the panel answers "why are they becoming PQLs", not why they are decaying.
 */
export async function pqlReasonBreakdown(f: UserFilters, includePaid: boolean) {
  const p: unknown[] = [[...MONETIZATION_SIGNAL_RULES]];
  const paid = includePaid ? "" : " AND NOT is_paid_user(u.user_id)";
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{ rule_id: string; label: string; points: number; users: string }>(
    `SELECT r->>'rule_id' AS rule_id, max(r->>'label') AS label, max((r->>'points')::int) AS points,
            count(DISTINCT u.user_id) AS users
     FROM users u
     JOIN pql_scores ps ON ps.user_id = u.user_id
     CROSS JOIN LATERAL jsonb_array_elements(ps.reasons) AS r
     WHERE (r->>'points')::int > 0 AND r->>'rule_id' = ANY($1::text[])${paid}${filter}
     GROUP BY 1
     ORDER BY users DESC, points DESC`,
    p
  );
  const p2: unknown[] = [];
  const scored = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM users u JOIN pql_scores ps ON ps.user_id = u.user_id
     WHERE true${includePaid ? "" : " AND NOT is_paid_user(u.user_id)"}${userFilterSql(f, p2)}`,
    p2
  );
  const total = Number(scored?.n ?? 0);
  return {
    data: {
      scored_users: total,
      signals: rows.map((r) => ({
        rule_id: r.rule_id,
        label: r.label,
        points: Number(r.points),
        users: Number(r.users),
        share_pct: pct(Number(r.users), total),
      })),
    },
    meta: {
      filters: filterMeta(f),
      include_paid: includePaid,
      source: "pql_scores.reasons - the same rows that produced each user's score",
      included_rules: "purchase-intent rules only (MONETIZATION_SIGNAL_RULES); activation rules are excluded",
      rules_version: PQL_RULES_VERSION,
    },
    definitions: definitionsFor(["pql_reason"]),
  };
}

// --------------------------------------------------------------------------- near-limit cohort

/** Unpaid users at or past `threshold` free Auto Applies, most urgent first. */
export async function nearLimitCohort(threshold: number, f: UserFilters, page: { limit: number; offset: number }) {
  const p: unknown[] = [threshold];
  const filter = userFilterSql(f, p);
  const where = `WHERE NOT is_paid_user(u.user_id) AND COALESCE(aau.used, 0) >= $1${filter}`;
  const [raw, total] = await Promise.all([
    queryRows<UserSummaryRow>(
      `SELECT ${USER_SUMMARY_COLUMNS}
       FROM users u ${USER_SUMMARY_JOINS}
       ${where}
       ORDER BY ps.priority ASC NULLS LAST, ps.score DESC NULLS LAST, aau.used DESC, u.user_id
       LIMIT ${page.limit} OFFSET ${page.offset}`,
      p
    ),
    queryOne<{ n: string }>(
      `SELECT count(*) AS n FROM users u LEFT JOIN auto_apply_usage aau ON aau.user_id = u.user_id ${where}`,
      p
    ),
  ]);
  const rows = await withUserDetails(raw);
  return {
    data: rows.map((r) => ({
      ...formatUserSummary(r, false),
      free_applies_remaining: Math.max(0, r.auto_apply_limit - r.auto_apply_used),
    })),
    total: Number(total?.n ?? 0),
    threshold,
  };
}

// --------------------------------------------------------------------------- conversion by market

/**
 * Usage-to-paid conversion per country for users who signed up in the range.
 * Stages are milestones reached at any time since, so a market's conversion is
 * not penalised for users who paid after the range ended.
 */
export async function marketConversion(range: DateRange, f: UserFilters, limit: number) {
  const p: unknown[] = [range.startUtc, range.endUtc];
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{
    country: string | null;
    users: number;
    activated: number;
    usage_40: number;
    pricing: number;
    checkout: number;
    paid: number;
  }>(
    `SELECT u.country,
            count(*)                                             AS users,
            count(act.user_id)                                   AS activated,
            count(*) FILTER (WHERE COALESCE(aau.used, 0) >= 40)  AS usage_40,
            count(pv.user_id)                                    AS pricing,
            count(co.user_id)                                    AS checkout,
            count(pd.user_id)                                    AS paid
     FROM users u
     LEFT JOIN auto_apply_usage aau ON aau.user_id = u.user_id
     LEFT JOIN user_milestones act ON act.user_id = u.user_id AND act.milestone = 'activated'
     LEFT JOIN user_milestones pv  ON pv.user_id = u.user_id AND pv.milestone = 'first_pricing_view'
     LEFT JOIN user_milestones co  ON co.user_id = u.user_id AND co.milestone = 'first_checkout'
     LEFT JOIN user_milestones pd  ON pd.user_id = u.user_id AND pd.milestone = 'first_paid'
     WHERE u.signup_at >= $1 AND u.signup_at < $2${filter}
     GROUP BY u.country
     ORDER BY users DESC, u.country
     LIMIT ${limit}`,
    p
  );
  return {
    data: {
      markets: rows.map((r) => ({
        country: r.country,
        users: r.users,
        activated: r.activated,
        usage_40_plus: r.usage_40,
        pricing: r.pricing,
        checkout: r.checkout,
        paid: r.paid,
        conversion_rate_pct: pct(r.paid, r.users),
      })),
    },
    meta: {
      ...rangeMeta(range),
      filters: filterMeta(f),
      cohort: "Users who signed up inside the range; stages reached at any time since.",
    },
    definitions: definitionsFor(["market_conversion", "activated_users"]),
  };
}
