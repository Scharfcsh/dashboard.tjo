import "server-only";
import { queryOne, queryRows } from "@/lib/db/pool";
import { listOpportunities } from "@/lib/dashboards/opportunities";
import { alertsSummary, overviewFunnel, overviewKpis, salesSummary } from "@/lib/dashboards/overview";
import { openAlertGroups, type AlertGroupRow } from "@/lib/metrics/alert-groups";
import { METRIC_DEFINITIONS } from "@/lib/metrics/definitions";
import type { UserFilters } from "@/lib/metrics/filters";
import { intelligenceMetrics, type PeriodRates } from "@/lib/metrics/intelligence";
import { growthSeries } from "@/lib/metrics/series";
import { mockRevenueCommandCenter } from "@/lib/mock-data";
import { countryName, formatCurrency } from "@/lib/revenue-center/format";
import type {
  AlertGroup,
  CheckoutStatus,
  DashboardFilters,
  FunnelStage,
  IconKey,
  IntelligenceMetric,
  KpiCardData,
  OpportunityRow,
  PrimaryAction,
  RevenueCommandCenterData,
  SystemStatus,
  Tone,
} from "@/lib/revenue-center/types";
import { parseRange } from "@/lib/time/business-time";

// ---------------------------------------------------------------------------
// Loads the Revenue Command Center from the live analytics database (the same
// lib/dashboards functions behind /api/overview*), mapped to the view-model.
// Falls back to demo data - clearly labelled - when the database is unreachable
// or nothing has been ingested yet.
// ---------------------------------------------------------------------------

export type Availability = { ok: true } | { ok: false; reason: string };

/** Shared by every dashboard loader: live data only when the analytics DB is reachable and has users. */
export async function checkAvailability(): Promise<Availability> {
  try {
    const row = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM users");
    if (!row || row.n === 0) return { ok: false, reason: "No users have been ingested yet — showing demo data." };
    return { ok: true };
  } catch (err) {
    console.warn("[revenue-center] analytics database unavailable, using demo data:", (err as Error).message);
    return { ok: false, reason: "Analytics database unavailable — showing demo data." };
  }
}

export async function loadRevenueCommandCenter(filters: DashboardFilters): Promise<RevenueCommandCenterData> {
  const availability = await checkAvailability();
  if (!availability.ok) return mockRevenueCommandCenter(filters, availability.reason);
  try {
    return await loadLive(filters);
  } catch (err) {
    console.error("[revenue-center] live load failed, using demo data", err);
    return mockRevenueCommandCenter(filters, "Live data failed to load — showing demo data.");
  }
}

async function loadLive(filters: DashboardFilters): Promise<RevenueCommandCenterData> {
  const f: UserFilters = { country: filters.country ?? undefined, source: filters.source ?? undefined };
  const range = parseRange({ range: filters.range });
  const funnelRange = parseRange({ range: filters.funnel });
  const intelligenceRange = parseRange({ range: "30d" });

  const [kpis, funnel, opportunities, sales, alertsCounts, alertGroups, growth, intelligence, options, status] =
    await Promise.all([
      overviewKpis(range, f),
      overviewFunnel(funnelRange, f),
      listOpportunities(f, { limit: 25, offset: 0 }, { minScore: 60, reveal: false }),
      salesSummary(range),
      alertsSummary(range, 1),
      openAlertGroups(),
      growthSeries(filters.chart, f),
      intelligenceMetrics(intelligenceRange, f),
      filterOptions(),
      systemStatus(),
    ]);

  return {
    source: { kind: "live" },
    generatedAt: new Date().toISOString(),
    filters,
    status,
    kpis: mapPrimaryKpis(kpis.data.primary, filters),
    secondaryKpis: mapSecondaryKpis(kpis.data.secondary),
    funnel: mapFunnel(funnel.data.stages),
    alerts: alertGroups.map(mapAlertGroup),
    openAlertCount: alertsCounts.data.open_total,
    opportunities: opportunities.data.map(mapOpportunity),
    opportunitiesTotal: opportunities.total,
    growth,
    salesTeam: {
      pipeline: [
        { key: "warm_leads", label: "Warm leads", value: sales.data.pipeline.warm_leads },
        { key: "assigned", label: "Assigned", value: sales.data.pipeline.assigned },
        { key: "contacted", label: "Contacted", value: sales.data.pipeline.contacted },
        { key: "connected", label: "Connected", value: sales.data.pipeline.connected },
        { key: "interested", label: "Interested", value: sales.data.pipeline.interested },
        { key: "converted", label: "Converted", value: sales.data.pipeline.converted },
      ],
      performers: sales.data.top_performers
        .filter((p) => p.contacts > 0)
        .slice(0, 5)
        .map((p) => ({ name: p.name ?? p.actor_id, contacts: p.contacts })),
    },
    intelligence: mapIntelligence(intelligence.current, intelligence.previous, intelligence.avgPql),
    countryOptions: options.countries,
    sourceOptions: options.sources,
  };
}

// --------------------------------------------------------------------------- mappers

type Primary = Awaited<ReturnType<typeof overviewKpis>>["data"]["primary"];
type Secondary = Awaited<ReturnType<typeof overviewKpis>>["data"]["secondary"];

const rangeWord = (r: DashboardFilters["range"]) => (r === "today" ? "today" : `in ${r.replace("d", " days")}`);

function mapPrimaryKpis(p: Primary, filters: DashboardFilters): KpiCardData[] {
  const today = filters.range === "today";
  return [
    {
      key: "total_users",
      label: "Total Users",
      icon: "users",
      tone: "teal",
      value: p.total_users.value,
      format: "number",
      secondary: `+${p.total_users.new_in_range} ${rangeWord(filters.range)}`,
      secondaryTone: "teal",
      changePct: p.total_users.change_pct,
      badge: null,
      focus: null,
      definition: METRIC_DEFINITIONS.total_users,
    },
    {
      key: "active_users",
      label: today ? "Active Today" : "Active Users",
      icon: "activity",
      tone: "green",
      value: p.active_users.value,
      format: "number",
      secondary: p.active_users.share_of_total_pct === null ? null : `${p.active_users.share_of_total_pct}% of total users`,
      changePct: p.active_users.change_pct,
      badge: null,
      focus: "online",
      definition: METRIC_DEFINITIONS.active_users,
    },
    {
      key: "hot_pqls",
      label: "Hot PQLs",
      icon: "flame",
      tone: "amber",
      value: p.hot_pqls.value,
      format: "number",
      secondary: "Need immediate follow-up",
      changePct: null,
      badge: p.hot_pqls.value > 0 ? { label: "Revenue Opportunity", tone: "amber" } : null,
      focus: "hot",
      definition: METRIC_DEFINITIONS.hot_pqls,
    },
    {
      key: "pricing_visitors",
      label: "Pricing Visitors",
      icon: "eye",
      tone: "blue",
      value: p.pricing_visitors.value,
      format: "number",
      secondary: `${p.pricing_visitors.pricing_views} pricing views`,
      changePct: p.pricing_visitors.change_pct,
      badge: null,
      focus: "pricing",
      definition: METRIC_DEFINITIONS.pricing_visitors,
    },
    {
      key: "checkout_started",
      label: "Checkout Started",
      icon: "cart",
      tone: "red",
      value: p.checkout_started.value,
      format: "number",
      secondary: `${p.checkout_started.abandoned_users} abandoned`,
      changePct: null,
      badge: p.checkout_started.value > 0 ? { label: "High Intent", tone: "red" } : null,
      focus: "checkout",
      definition: `${METRIC_DEFINITIONS.checkout_started} ${METRIC_DEFINITIONS.checkout_abandoned}`,
    },
    {
      key: "paid",
      label: today ? "Paid Today" : "Paid",
      icon: "wallet",
      tone: "teal",
      value: p.paid_conversions.value,
      format: "number",
      secondary: `${formatCurrency(p.paid_conversions.revenue.value)} revenue`,
      changePct: p.paid_conversions.change_pct,
      badge: null,
      focus: null,
      definition: `${METRIC_DEFINITIONS.paid_conversions} Revenue: ${METRIC_DEFINITIONS.revenue}`,
    },
  ];
}

function mapSecondaryKpis(s: Secondary): KpiCardData[] {
  const base = { format: "number" as const, secondary: null, changePct: null, badge: null, focus: null };
  return [
    { ...base, key: "usage40", label: "40+ Free Applies Used", icon: "file", tone: "blue", value: s.free_applies_40_plus.value, focus: "usage40", definition: METRIC_DEFINITIONS.free_applies_40_plus },
    { ...base, key: "usage45", label: "45+ Free Applies Used", icon: "file", tone: "blue", value: s.free_applies_45_plus.value, focus: "usage45", definition: METRIC_DEFINITIONS.free_applies_45_plus },
    {
      ...base,
      key: "quota",
      label: "50/50 Exhausted",
      icon: "alert",
      tone: "red",
      value: s.quota_exhausted.value,
      badge: s.quota_exhausted.value > 0 ? { label: "Call Now", tone: "red" } : null,
      focus: "quota",
      definition: METRIC_DEFINITIONS.quota_exhausted,
    },
    {
      ...base,
      key: "payment_failed",
      label: "Payment Failed",
      icon: "x-circle",
      tone: "red",
      value: s.payment_failed_users.value,
      badge: s.payment_failed_users.value > 0 ? { label: "Recover Revenue", tone: "red" } : null,
      focus: "payment_failed",
      definition: METRIC_DEFINITIONS.payment_failed_users,
    },
    { ...base, key: "dormant", label: "Dormant 3 Days", icon: "moon", tone: "purple", value: s.dormant_3d.value, definition: METRIC_DEFINITIONS.dormant_3d },
    { ...base, key: "returned", label: "Returned Users", icon: "refresh", tone: "teal", value: s.returned_users.value, definition: METRIC_DEFINITIONS.returned_users },
  ];
}

const FUNNEL_META: Record<string, { label: string; icon: IconKey; tone: Tone }> = {
  active: { label: "Active Users", icon: "users", tone: "teal" },
  activated: { label: "Activated", icon: "zap", tone: "blue" },
  core_feature: { label: "Core Feature Users", icon: "target", tone: "indigo" },
  pql: { label: "Product Qualified Leads", icon: "sparkles", tone: "purple" },
  pricing: { label: "Pricing Intent", icon: "flame", tone: "amber" },
  checkout: { label: "Checkout", icon: "cart", tone: "red" },
  paid: { label: "Paid", icon: "wallet", tone: "green" },
};

type ApiStage = Awaited<ReturnType<typeof overviewFunnel>>["data"]["stages"][number];

function mapFunnel(stages: ApiStage[]): FunnelStage[] {
  return stages.map((s) => ({
    key: s.stage,
    ...(FUNNEL_META[s.stage] ?? { label: s.stage, icon: "target" as IconKey, tone: "slate" as Tone }),
    count: s.count,
    independentCount: s.independent_count,
    conversionFromPrevious: s.conversion_from_previous_pct,
    conversionFromStart: s.conversion_from_active_pct,
  }));
}

const ALERT_TEXT: Record<string, { text: (n: number) => string; severity: AlertGroup["severity"]; icon: IconKey; tone: Tone }> = {
  quota_exhausted: { text: (n) => `${n} ${n === 1 ? "user" : "users"} reached 50/50 free Auto Applies`, severity: "critical", icon: "alert", tone: "red" },
  checkout_abandoned: { text: (n) => `${n} ${n === 1 ? "user" : "users"} abandoned checkout`, severity: "critical", icon: "cart", tone: "red" },
  payment_failed: { text: (n) => `${n} payment ${n === 1 ? "failure requires" : "failures require"} follow-up`, severity: "recovery", icon: "x-circle", tone: "red" },
  pricing_high_usage: { text: (n) => `${n} ${n === 1 ? "user" : "users"} viewing pricing with 40+ applies used`, severity: "opportunity", icon: "flame", tone: "amber" },
  near_limit: { text: (n) => `${n} ${n === 1 ? "user" : "users"} reached 45+ applications`, severity: "warning", icon: "file", tone: "amber" },
  dormant_power_user_returned: { text: (n) => `${n} high-value dormant ${n === 1 ? "user" : "users"} returned`, severity: "opportunity", icon: "users", tone: "indigo" },
  repeated_failure: { text: (n) => `${n} heavy ${n === 1 ? "user" : "users"} experienced repeated Auto Apply failures`, severity: "warning", icon: "alert", tone: "purple" },
  new_activated: { text: (n) => `${n} new ${n === 1 ? "user" : "users"} activated`, severity: "opportunity", icon: "zap", tone: "green" },
  sales_support_handoff: { text: (n) => `${n} support ${n === 1 ? "handoff" : "handoffs"} from sales`, severity: "warning", icon: "users", tone: "blue" },
};

function mapAlertGroup(g: AlertGroupRow): AlertGroup {
  const known = ALERT_TEXT[g.rule_id];
  const fallbackSeverity: AlertGroup["severity"] = g.priority === "P0" ? "critical" : g.priority === "P1" ? "warning" : "opportunity";
  return {
    id: g.rule_id,
    text: known ? known.text(g.users) : `${g.users} × ${g.rule_name}`,
    severity: known?.severity ?? fallbackSeverity,
    icon: known?.icon ?? "alert",
    tone: known?.tone ?? (g.priority === "P0" ? "red" : "amber"),
    count: g.users,
    latestAt: g.latest_at.toISOString(),
  };
}

type ApiOpportunity = Awaited<ReturnType<typeof listOpportunities>>["data"][number];

const CHECKOUT_LABEL: Record<CheckoutStatus, string> = {
  not_started: "Not started",
  plan_selected: "Plan selected",
  started: "Not completed",
  abandoned: "Abandoned",
};

function primaryAction(nextBestAction: string | null): PrimaryAction {
  if (nextBestAction === "call_now") return "call_now";
  if (nextBestAction === "checkout_recovery" || nextBestAction === "payment_recovery") return "recover";
  return "follow_up";
}

const iso = (d: Date | string | null) => (d === null ? null : typeof d === "string" ? d : d.toISOString());

function mapOpportunity(o: ApiOpportunity): OpportunityRow {
  const status = o.signals.checkout_status as CheckoutStatus;
  return {
    userId: o.user_id,
    displayId: o.user_id,
    name: o.name ?? o.user_id,
    country: o.country,
    isOnline: o.presence.is_online,
    lastSeenAt: iso(o.presence.last_seen_at),
    autoApplyUsed: o.auto_apply.used,
    autoApplyLimit: o.auto_apply.limit,
    pricingViews: o.signals.pricing_views_30d,
    checkoutStatus: status,
    checkoutLabel: CHECKOUT_LABEL[status] ?? "Not started",
    paymentFailed: o.signals.payment_failed,
    pqlScore: o.pql.score,
    priority: o.pql.priority as OpportunityRow["priority"],
    whyHot: o.lead_reason || "High PQL score",
    ownerName: o.sales.owner_name,
    lastContactAt: iso(o.sales.last_contacted_at),
    action: primaryAction(o.pql.next_best_action),
    leadId: o.sales.lead_id,
  };
}

function mapIntelligence(current: PeriodRates, previous: PeriodRates, avgPql: number | null): IntelligenceMetric[] {
  const pts = (k: keyof PeriodRates) =>
    current[k] === null || previous[k] === null ? null : Math.round((current[k]! - previous[k]!) * 10) / 10;
  const rel = (k: keyof PeriodRates) =>
    current[k] === null || !previous[k] ? null : Math.round(((current[k]! - previous[k]!) / previous[k]!) * 1000) / 10;
  return [
    { key: "activation_rate", label: "Activation Rate", icon: "zap", tone: "amber", value: current.activation_rate, format: "percent", change: pts("activation_rate"), changeUnit: "pts", definition: METRIC_DEFINITIONS.activation_rate },
    { key: "d1_retention", label: "D1 Retention", icon: "user-check", tone: "blue", value: current.d1_retention, format: "percent", change: pts("d1_retention"), changeUnit: "pts", definition: METRIC_DEFINITIONS.retention_dn },
    { key: "d7_retention", label: "D7 Retention", icon: "calendar", tone: "blue", value: current.d7_retention, format: "percent", change: pts("d7_retention"), changeUnit: "pts", definition: METRIC_DEFINITIONS.retention_dn },
    { key: "free_to_paid", label: "Free-to-Paid Rate", icon: "filter", tone: "purple", value: current.free_to_paid, format: "percent", change: pts("free_to_paid"), changeUnit: "pts", definition: METRIC_DEFINITIONS.free_to_paid_rate },
    { key: "pricing_to_checkout", label: "Pricing-to-Checkout Rate", icon: "cart", tone: "green", value: current.pricing_to_checkout, format: "percent", change: pts("pricing_to_checkout"), changeUnit: "pts", definition: METRIC_DEFINITIONS.pricing_to_checkout_rate },
    { key: "checkout_to_paid", label: "Checkout-to-Paid Rate", icon: "credit-card", tone: "blue", value: current.checkout_to_paid, format: "percent", change: pts("checkout_to_paid"), changeUnit: "pts", definition: METRIC_DEFINITIONS.checkout_to_paid_rate },
    { key: "avg_pql", label: "Average PQL Score", icon: "gauge", tone: "red", value: avgPql, format: "number", change: null, changeUnit: "%", definition: METRIC_DEFINITIONS.average_pql_score },
    { key: "arppu", label: "Average Revenue Per Paid User", icon: "coins", tone: "amber", value: current.arppu, format: "currency", change: rel("arppu"), changeUnit: "%", definition: METRIC_DEFINITIONS.arppu },
  ];
}

async function filterOptions() {
  const [countries, sources] = await Promise.all([
    queryRows<{ country: string }>("SELECT DISTINCT country FROM users WHERE country IS NOT NULL ORDER BY country"),
    queryRows<{ source: string }>("SELECT DISTINCT lower(acq_source) AS source FROM users WHERE acq_source IS NOT NULL ORDER BY 1"),
  ]);
  return {
    countries: countries.map((c) => ({ value: c.country, label: countryName(c.country) })),
    sources: sources.map((s) => ({ value: s.source, label: s.source[0]!.toUpperCase() + s.source.slice(1) })),
  };
}

/** Data freshness: derived state is only as current as the last successful pipeline/rollup. */
async function systemStatus(): Promise<SystemStatus> {
  const row = await queryOne<{ finished_at: Date | null }>(
    `SELECT max(finished_at) AS finished_at FROM job_runs
     WHERE status = 'success' AND job_name IN ('pipeline', 'rollup')`
  );
  const last = row?.finished_at;
  const ageMin = last ? Math.round((Date.now() - last.getTime()) / 60_000) : null;
  if (ageMin !== null && ageMin <= 10) {
    return { state: "operational", label: "All Systems Operational", detail: `Derived data refreshed ${ageMin} min ago` };
  }
  return {
    state: "delayed",
    label: "Data delayed",
    detail: last ? `Last successful rollup ${ageMin} min ago — check the job scheduler` : "No rollup has run yet",
  };
}

/** Data every dashboard page's shell needs (sidebar alert badge). */
export async function loadShellData(): Promise<{ openAlertCount: number }> {
  const availability = await checkAvailability();
  if (!availability.ok) return { openAlertCount: mockRevenueCommandCenter(parseDemoFilters(), "").openAlertCount };
  try {
    const row = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM alerts WHERE status <> 'resolved'");
    return { openAlertCount: row?.n ?? 0 };
  } catch {
    return { openAlertCount: 0 };
  }
}

const parseDemoFilters = (): DashboardFilters => ({ range: "today", funnel: "today", chart: 30, country: null, source: null });
