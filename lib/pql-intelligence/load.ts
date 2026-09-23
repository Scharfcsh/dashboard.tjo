import "server-only";
import { queryRows } from "@/lib/db/pool";
import {
  criticalSignals,
  marketConversion,
  monetizationFunnel,
  nearLimitCohort,
  pqlDistribution,
  pqlReasonBreakdown,
  triggerEffectiveness,
  usageStages,
} from "@/lib/dashboards/monetization";
import { listOpportunities, type PricingIntent } from "@/lib/dashboards/opportunities";
import { experimentResults } from "@/lib/experiments/results";
import { mockPqlIntelligence } from "@/lib/pql-intelligence/mock";
import { USAGE_BOUNDS } from "@/lib/pql-intelligence/filters";
import {
  bestVariant,
  checkoutPresentation,
  experimentStatusLabel,
  leadAction,
  remaining,
  successRate,
} from "@/lib/pql-intelligence/derive";
import type {
  CriticalSignalCard,
  ExperimentView,
  LeadReason,
  MarketRow,
  MonetizationStage,
  NearLimitUser,
  PqlBand,
  PqlFilters,
  PqlIntelligenceData,
  TriggerRow,
  UpgradeLead,
  UsageStageCard,
} from "@/lib/pql-intelligence/types";
import { checkAvailability } from "@/lib/revenue-center/load";
import { countryName } from "@/lib/revenue-center/format";
import type { IconKey, SystemStatus, Tone } from "@/lib/revenue-center/types";
import type { UserFilters } from "@/lib/metrics/filters";
import { parseRange } from "@/lib/time/business-time";

// ---------------------------------------------------------------------------
// Loads Dashboard 4 from the live analytics database - the same lib/dashboards
// functions behind /api/monetization/* - mapped to the view-model. Falls back to
// clearly labelled demo data when the database is unreachable or empty.
//
// Range and country apply to every panel. The lead filters (usage, score,
// intent, owner, lead status) narrow the lead table, the near-limit cohort and
// the CSV export only; the page says so next to the table.
// ---------------------------------------------------------------------------

const LEAD_PAGE = 50;
const NEAR_LIMIT_PAGE = 8;

export async function loadPqlIntelligence(filters: PqlFilters): Promise<PqlIntelligenceData> {
  const availability = await checkAvailability();
  if (!availability.ok) return mockPqlIntelligence(filters, availability.reason);
  try {
    return await loadLive(filters);
  } catch (err) {
    console.error("[pql-intelligence] live load failed, using demo data", err);
    return mockPqlIntelligence(filters, "Live data failed to load — showing demo data.");
  }
}

/** "All" still means a qualifying lead: a routing priority, or a warm score. */
const MIN_SCORE: Record<PqlFilters["score"], number> = { all: 60, "40": 40, "60": 60, "75": 75, "90": 90 };

async function loadLive(filters: PqlFilters): Promise<PqlIntelligenceData> {
  const f: UserFilters = { country: filters.country ?? undefined, source: undefined };
  // The range selects a cohort: the funnel, markets and trigger panels cover
  // users who entered in that window. The usage stages, critical signals, PQL
  // bands and the lead queue are current state and do not move with it - each
  // panel says which it is.
  const range = parseRange({ range: filters.range });
  const usage = USAGE_BOUNDS[filters.usage];

  const [stages, signals, funnel, distribution, reasons, leads, nearLimit, markets, triggers, experiments, options] =
    await Promise.all([
      usageStages(f, false),
      criticalSignals(f),
      monetizationFunnel(range, f),
      pqlDistribution(f, false),
      pqlReasonBreakdown(f, false),
      listOpportunities(f, { limit: LEAD_PAGE, offset: 0 }, {
        minScore: MIN_SCORE[filters.score],
        usageMin: usage.min,
        usageMax: usage.max,
        pricingIntent: filters.intent === "all" ? undefined : (filters.intent as PricingIntent),
        ownerId: filters.owner ?? undefined,
        leadStatus: filters.leadStatus === "all" ? undefined : filters.leadStatus,
        reveal: false,
      }),
      nearLimitCohort(filters.nearLimit, f, { limit: NEAR_LIMIT_PAGE, offset: 0 }),
      marketConversion(range, f, 8),
      triggerEffectiveness(range, f, 14),
      experimentResults(f),
      filterOptions(),
    ]);

  return {
    source: { kind: "live" },
    generatedAt: new Date().toISOString(),
    filters,
    status: await systemStatus(),
    usageStages: mapStages(stages.data.stages),
    usersWithUsage: stages.data.users_with_usage,
    criticalSignals: mapSignals(signals.data.signals),
    funnel: mapFunnel(funnel.data.stages, funnel.data.biggest_drop_off?.stage ?? null),
    biggestDropLabel: funnel.data.biggest_drop_off ? STAGE_META[funnel.data.biggest_drop_off.stage]?.label ?? null : null,
    bands: mapBands(distribution.data.bands),
    totalPqls: distribution.data.total_pqls,
    leads: leads.data.map(mapLead),
    leadsTotal: leads.total,
    leadReasons: reasons.data.signals.map(
      (s): LeadReason => ({ ruleId: s.rule_id, label: s.label, points: s.points, users: s.users, sharePct: s.share_pct })
    ),
    scoredUsers: reasons.data.scored_users,
    nearLimit: nearLimit.data.map(mapNearLimit),
    nearLimitTotal: nearLimit.total,
    markets: markets.data.markets.map(
      (m): MarketRow => ({
        country: m.country,
        users: m.users,
        activated: m.activated,
        usage40Plus: m.usage_40_plus,
        pricing: m.pricing,
        checkout: m.checkout,
        paid: m.paid,
        conversionPct: m.conversion_rate_pct,
      })
    ),
    triggers: mapTriggers(triggers.data.triggers),
    triggerExposureBasis: triggers.data.exposure_basis,
    experiments: experiments.map(mapExperiment),
    countryOptions: options.countries,
    ownerOptions: options.owners,
  };
}

// --------------------------------------------------------------------------- mappers

const STAGE_CARD_META: Record<string, { icon: IconKey; tone: Tone; title: string }> = {
  "0-10": { icon: "users", tone: "blue", title: "0–10 Used" },
  "11-25": { icon: "leaf", tone: "teal", title: "11–25 Used" },
  "26-39": { icon: "chart", tone: "purple", title: "26–39 Used" },
  "40-44": { icon: "flame", tone: "amber", title: "40–44 Used" },
  "45-49": { icon: "target", tone: "orange", title: "45–49 Used" },
  "50": { icon: "crown", tone: "red", title: "50 / 50 Used" },
};

const STAGE_LABELS: Record<string, string> = {
  "0-10": "Early Users",
  "11-25": "Developing Value",
  "26-39": "Engaged",
  "40-44": "Warm",
  "45-49": "Hot",
  "50": "Immediate Upgrade Opportunity",
};

type ApiStage = Awaited<ReturnType<typeof usageStages>>["data"]["stages"][number];

function mapStages(stages: ApiStage[]): UsageStageCard[] {
  return stages.map((s) => {
    const meta = STAGE_CARD_META[s.stage] ?? { icon: "users" as IconKey, tone: "slate" as Tone, title: s.stage };
    return {
      key: s.stage,
      title: meta.title,
      label: STAGE_LABELS[s.stage] ?? s.label,
      users: s.users,
      sharePct: s.share_pct,
      icon: meta.icon,
      tone: meta.tone,
      usage: s.stage as UsageStageCard["usage"],
    };
  });
}

const SIGNAL_META: Record<string, { icon: IconKey; tone: Tone; filter: Partial<PqlFilters> | null }> = {
  quota_unpaid: { icon: "alert", tone: "red", filter: { usage: "50" } },
  near_limit_pricing: { icon: "trending-up", tone: "amber", filter: { usage: "45-49", intent: "viewed" } },
  checkout_abandoned: { icon: "cart", tone: "purple", filter: { intent: "abandoned" } },
  payment_failed: { icon: "x-circle", tone: "red", filter: { intent: "checkout" } },
  hot_unassigned: { icon: "users", tone: "blue", filter: { score: "75", leadStatus: "unassigned" } },
  converted_after_limit: { icon: "check-circle", tone: "green", filter: null },
};

type ApiSignal = Awaited<ReturnType<typeof criticalSignals>>["data"]["signals"][number];

function mapSignals(signals: ApiSignal[]): CriticalSignalCard[] {
  return signals.map((s) => {
    const meta = SIGNAL_META[s.key] ?? { icon: "alert" as IconKey, tone: "slate" as Tone, filter: null };
    return { key: s.key, title: s.label, caption: s.caption, value: s.value, ...meta };
  });
}

const STAGE_META: Record<string, { label: string; icon: IconKey; tone: Tone }> = {
  started_auto_apply: { label: "Started Auto Apply", icon: "zap", tone: "blue" },
  used_10: { label: "10 Applications", icon: "file", tone: "blue" },
  used_25: { label: "25 Applications", icon: "file", tone: "indigo" },
  used_40: { label: "40 Applications", icon: "flame", tone: "purple" },
  used_45: { label: "45 Applications", icon: "flame", tone: "amber" },
  used_50: { label: "50 Applications", icon: "crown", tone: "orange" },
  pricing_viewed: { label: "Pricing Viewed", icon: "eye", tone: "amber" },
  checkout_started: { label: "Checkout", icon: "cart", tone: "red" },
  paid: { label: "Paid", icon: "wallet", tone: "green" },
};

type ApiFunnelStage = Awaited<ReturnType<typeof monetizationFunnel>>["data"]["stages"][number];

function mapFunnel(stages: ApiFunnelStage[], biggestDrop: string | null): MonetizationStage[] {
  return stages.map((s) => {
    const meta = STAGE_META[s.stage] ?? { label: s.stage, icon: "target" as IconKey, tone: "slate" as Tone };
    const conversion = s.conversion_from_previous_pct;
    return {
      key: s.stage,
      ...meta,
      users: s.users,
      conversionFromStart: s.conversion_from_start_pct,
      dropFromPrevious: conversion === null ? null : Math.round((conversion - 100) * 10) / 10,
      isBiggestDrop: s.stage === biggestDrop,
    };
  });
}

const BAND_TONE: Record<string, Tone> = {
  buy_now: "green",
  hot: "red",
  warm: "amber",
  engaged: "blue",
  early: "slate",
};

const BAND_RANGE: Record<string, string> = {
  buy_now: "90–100",
  hot: "75–89",
  warm: "60–74",
  engaged: "40–59",
  early: "0–39",
};

type ApiBand = Awaited<ReturnType<typeof pqlDistribution>>["data"]["bands"][number];

const mapBands = (bands: ApiBand[]): PqlBand[] =>
  bands.map((b) => ({
    category: b.category,
    label: b.label,
    range: BAND_RANGE[b.category] ?? `${b.min}+`,
    users: b.users,
    sharePct: b.share_pct,
    tone: BAND_TONE[b.category] ?? "slate",
  }));

type ApiLead = Awaited<ReturnType<typeof listOpportunities>>["data"][number];

const iso = (d: Date | string | null) => (d === null ? null : typeof d === "string" ? d : d.toISOString());

function mapLead(o: ApiLead): UpgradeLead {
  const checkout = checkoutPresentation(o.signals.checkout_status);
  return {
    userId: o.user_id,
    name: o.name ?? o.user_id,
    country: o.country,
    priority: o.pql.priority as UpgradeLead["priority"],
    autoApplyUsed: o.auto_apply.used,
    autoApplyLimit: o.auto_apply.limit,
    remaining: remaining(o.auto_apply.used, o.auto_apply.limit),
    successRatePct: successRate(o.auto_apply.success_total, o.auto_apply.started_total),
    successCount: o.auto_apply.success_total,
    pricingViews: o.signals.pricing_views_30d,
    planClicked: o.last_plan_clicked,
    checkoutLabel: checkout.label,
    checkoutTone: checkout.tone,
    pqlScore: o.pql.score,
    reason: o.lead_reason || "High PQL score",
    ownerName: o.sales.owner_name,
    action: leadAction(o.pql.next_best_action, o.pql.priority),
    isOnline: o.presence.is_online,
    lastActiveAt: iso(o.last_active_at),
  };
}

type ApiNearLimit = Awaited<ReturnType<typeof nearLimitCohort>>["data"][number];

const mapNearLimit = (u: ApiNearLimit): NearLimitUser => ({
  userId: u.user_id,
  name: u.name ?? u.user_id,
  autoApplyUsed: u.auto_apply.used,
  autoApplyLimit: u.auto_apply.limit,
  pqlScore: u.pql.score,
  priority: u.pql.priority as NearLimitUser["priority"],
  lastActiveAt: iso(u.last_active_at),
});

type ApiTrigger = Awaited<ReturnType<typeof triggerEffectiveness>>["data"]["triggers"][number];

/** The reference's rows: prompts at 40/45/48/49 and the hard paywall at 50. */
const TRIGGER_LABEL = (threshold: number) =>
  threshold === 50 ? "Hard paywall at 50" : `Prompt at ${threshold} apps`;

function mapTriggers(triggers: ApiTrigger[]): TriggerRow[] {
  return triggers
    .filter((t) => t.threshold >= 40)
    .map((t) => ({
      key: t.trigger,
      label: TRIGGER_LABEL(t.threshold),
      usersExposed: t.users_exposed,
      pricingClick: t.pricing_viewed_after,
      checkout: t.checkout_started_after,
      paid: t.converted_within_window,
      conversionPct: t.conversion_rate_pct,
    }));
}

function mapExperiment(e: Awaited<ReturnType<typeof experimentResults>>[number]): ExperimentView {
  const variants = e.variants.map((v) => ({
    variant: v.variant,
    label: v.label ?? v.variant,
    isControl: v.is_control,
    users: v.users,
    conversionPct: v.conversion_rate_pct,
    liftPct: v.lift_vs_control_pct,
    confidencePct: v.confidence_pct,
  }));
  const best = bestVariant(variants);
  return {
    id: e.id,
    name: e.name,
    status: experimentStatusLabel(e.status),
    users: e.users,
    variants,
    conversionPct: best?.conversionPct ?? variants[0]?.conversionPct ?? null,
    liftPct: best?.liftPct ?? null,
    confidencePct: best?.confidencePct ?? null,
  };
}

// --------------------------------------------------------------------------- options + status

async function filterOptions() {
  const [countries, owners] = await Promise.all([
    queryRows<{ country: string }>("SELECT DISTINCT country FROM users WHERE country IS NOT NULL ORDER BY country"),
    queryRows<{ id: string; name: string }>(
      "SELECT id, name FROM team_members WHERE active AND role IN ('caller', 'sales_manager') ORDER BY name"
    ),
  ]);
  return {
    countries: countries.map((c) => ({ value: c.country, label: countryName(c.country) })),
    owners: owners.map((o) => ({ value: o.id, label: o.name })),
  };
}

/** Derived state is only as current as the last successful pipeline run. */
async function systemStatus(): Promise<SystemStatus> {
  const rows = await queryRows<{ finished_at: Date | null }>(
    `SELECT max(finished_at) AS finished_at FROM job_runs
     WHERE status = 'success' AND job_name IN ('pipeline', 'rollup', 'scoring')`
  );
  const last = rows[0]?.finished_at;
  const ageMin = last ? Math.round((Date.now() - last.getTime()) / 60_000) : null;
  if (ageMin !== null && ageMin <= 10) {
    return { state: "operational", label: "All Systems Operational", detail: `Scores refreshed ${ageMin} min ago` };
  }
  return {
    state: "delayed",
    label: "Scores delayed",
    detail: last ? `Last successful scoring run ${ageMin} min ago` : "No scoring run has completed yet",
  };
}
