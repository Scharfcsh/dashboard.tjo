import { NEAR_LIMIT_TABS } from "@/lib/pql-intelligence/derive";
import type {
  LeadStatusFilter,
  PqlFilters,
  PqlRange,
  PricingIntentFilter,
  ScoreBand,
  UsageBand,
} from "@/lib/pql-intelligence/types";

// URL search params <-> Dashboard 4 filters. Invalid values fall back to the
// default rather than erroring - a hand-edited URL should still render.

const RANGES: PqlRange[] = ["today", "7d", "30d"];
const USAGE: UsageBand[] = ["all", "0-10", "11-25", "26-39", "40-44", "45-49", "50"];
const SCORES: ScoreBand[] = ["all", "90", "75", "60", "40"];
const INTENTS: PricingIntentFilter[] = ["all", "viewed", "plan_clicked", "checkout", "abandoned", "none"];
const LEAD_STATUSES: LeadStatusFilter[] = ["all", "unassigned", "new", "contacted", "interested", "callback"];

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(allowed: T[], value: string | undefined, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export const DEFAULT_PQL_FILTERS: PqlFilters = {
  range: "30d",
  country: null,
  usage: "all",
  score: "all",
  intent: "all",
  owner: null,
  leadStatus: "all",
  nearLimit: 40,
};

export function parsePqlFilters(params: Params): PqlFilters {
  const country = first(params.country);
  const owner = first(params.owner);
  const nearLimit = Number(first(params.near_limit));
  return {
    range: pick(RANGES, first(params.range), DEFAULT_PQL_FILTERS.range),
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
    usage: pick(USAGE, first(params.usage), "all"),
    score: pick(SCORES, first(params.score), "all"),
    intent: pick(INTENTS, first(params.intent), "all"),
    owner: owner && /^[0-9a-f-]{36}$/i.test(owner) ? owner : null,
    leadStatus: pick(LEAD_STATUSES, first(params.lead_status), "all"),
    nearLimit: (NEAR_LIMIT_TABS as readonly number[]).includes(nearLimit) ? nearLimit : DEFAULT_PQL_FILTERS.nearLimit,
  };
}

/** Usage bands as inclusive bounds for the lead query. */
export const USAGE_BOUNDS: Record<UsageBand, { min?: number; max?: number }> = {
  all: {},
  "0-10": { min: 0, max: 10 },
  "11-25": { min: 11, max: 25 },
  "26-39": { min: 26, max: 39 },
  "40-44": { min: 40, max: 44 },
  "45-49": { min: 45, max: 49 },
  "50": { min: 50 },
};

export const RANGE_LABELS: Record<PqlRange, string> = { today: "Today", "7d": "7 Days", "30d": "30 Days" };

export const USAGE_LABELS: Record<UsageBand, string> = {
  all: "All Usage",
  "0-10": "0-10 used",
  "11-25": "11-25 used",
  "26-39": "26-39 used",
  "40-44": "40-44 used",
  "45-49": "45-49 used",
  "50": "50/50 used",
};

export const SCORE_LABELS: Record<ScoreBand, string> = {
  all: "All Scores",
  "90": "90+ Buy Now",
  "75": "75+ Hot",
  "60": "60+ Warm",
  "40": "40+ Engaged",
};

export const INTENT_LABELS: Record<PricingIntentFilter, string> = {
  all: "All Intent",
  viewed: "Pricing viewed",
  plan_clicked: "Plan clicked",
  checkout: "Checkout started",
  abandoned: "Checkout abandoned",
  none: "No pricing intent",
};

export const LEAD_STATUS_LABELS: Record<LeadStatusFilter, string> = {
  all: "All Statuses",
  unassigned: "Unassigned",
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  callback: "Callback",
};

/** Filters that narrow the lead table (everything except range/country, which are global). */
export function activeLeadFilterCount(f: PqlFilters): number {
  return [f.usage !== "all", f.score !== "all", f.intent !== "all", f.owner !== null, f.leadStatus !== "all"].filter(
    Boolean
  ).length;
}
