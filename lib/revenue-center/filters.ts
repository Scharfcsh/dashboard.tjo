import type { ChartDays, DashboardFilters, FunnelRange, RangePreset } from "@/lib/revenue-center/types";

// URL search params <-> dashboard filters. Invalid values fall back to defaults
// rather than erroring: a hand-edited URL should still render a dashboard.

const RANGES: RangePreset[] = ["today", "7d", "30d", "90d"];
const FUNNELS: FunnelRange[] = ["today", "7d", "30d"];
const CHARTS: ChartDays[] = [7, 30, 90];

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseDashboardFilters(params: Params): DashboardFilters {
  const range = first(params.range);
  const funnel = first(params.funnel);
  const chart = Number(first(params.chart));
  const country = first(params.country);
  const source = first(params.source);
  return {
    range: RANGES.includes(range as RangePreset) ? (range as RangePreset) : "today",
    funnel: FUNNELS.includes(funnel as FunnelRange) ? (funnel as FunnelRange) : "today",
    chart: CHARTS.includes(chart as ChartDays) ? (chart as ChartDays) : 30,
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
    source: source && source.length <= 100 ? source.toLowerCase() : null,
  };
}

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export const CHART_LABELS: Record<ChartDays, string> = { 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" };
