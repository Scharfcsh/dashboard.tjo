import type { DataSource, FilterOption, IconKey, SystemStatus, Tone } from "@/lib/revenue-center/types";

// ---------------------------------------------------------------------------
// Dashboard 4 view-model. Components consume only these types: the live loader
// and the demo dataset both produce this exact shape, and neither source leaks
// into JSX. Icons cross the boundary as IconKey, tones as Tone.
// ---------------------------------------------------------------------------

export type PqlRange = "today" | "7d" | "30d";

/** Named usage windows for the lead table. `all` is the unfiltered default. */
export type UsageBand = "all" | "0-10" | "11-25" | "26-39" | "40-44" | "45-49" | "50";

export type ScoreBand = "all" | "90" | "75" | "60" | "40";

export type PricingIntentFilter = "all" | "viewed" | "plan_clicked" | "checkout" | "abandoned" | "none";

export type LeadStatusFilter = "all" | "unassigned" | "new" | "contacted" | "interested" | "callback";

export interface PqlFilters {
  range: PqlRange;
  country: string | null;
  usage: UsageBand;
  score: ScoreBand;
  intent: PricingIntentFilter;
  owner: string | null;
  leadStatus: LeadStatusFilter;
  /** Near-limit cohort tab. */
  nearLimit: number;
}

export interface UsageStageCard {
  key: string;
  title: string;
  label: string;
  users: number;
  sharePct: number | null;
  icon: IconKey;
  tone: Tone;
  usage: UsageBand;
}

export interface CriticalSignalCard {
  key: string;
  title: string;
  caption: string;
  value: number;
  icon: IconKey;
  tone: Tone;
  /** Filters the lead table when clicked; null means the card is informational. */
  filter: Partial<PqlFilters> | null;
}

export interface MonetizationStage {
  key: string;
  label: string;
  users: number;
  tone: Tone;
  icon: IconKey;
  conversionFromStart: number | null;
  dropFromPrevious: number | null;
  isBiggestDrop: boolean;
}

export interface PqlBand {
  category: string;
  label: string;
  range: string;
  users: number;
  sharePct: number | null;
  tone: Tone;
}

export interface LeadReason {
  ruleId: string;
  label: string;
  points: number;
  users: number;
  sharePct: number | null;
}

export type LeadAction = "call_now" | "contact" | "follow_up" | "recover";

export interface UpgradeLead {
  userId: string;
  name: string;
  country: string | null;
  priority: "P0" | "P1" | "P2" | null;
  autoApplyUsed: number;
  autoApplyLimit: number;
  remaining: number;
  successRatePct: number | null;
  successCount: number;
  pricingViews: number;
  planClicked: string | null;
  checkoutLabel: string;
  checkoutTone: Tone;
  pqlScore: number;
  reason: string;
  ownerName: string | null;
  action: LeadAction;
  isOnline: boolean;
  lastActiveAt: string | null;
}

export interface NearLimitUser {
  userId: string;
  name: string;
  autoApplyUsed: number;
  autoApplyLimit: number;
  pqlScore: number;
  priority: "P0" | "P1" | "P2" | null;
  lastActiveAt: string | null;
}

export interface MarketRow {
  country: string | null;
  users: number;
  activated: number;
  usage40Plus: number;
  pricing: number;
  checkout: number;
  paid: number;
  conversionPct: number | null;
}

export interface TriggerRow {
  key: string;
  label: string;
  usersExposed: number;
  pricingClick: number;
  checkout: number;
  paid: number;
  conversionPct: number | null;
}

export interface ExperimentVariantView {
  variant: string;
  label: string;
  isControl: boolean;
  users: number;
  conversionPct: number | null;
  liftPct: number | null;
  confidencePct: number | null;
}

export interface ExperimentView {
  id: string;
  name: string;
  status: string;
  users: number;
  variants: ExperimentVariantView[];
  /** Headline numbers for the compact card: the best non-control arm. */
  conversionPct: number | null;
  liftPct: number | null;
  confidencePct: number | null;
}

export interface PqlIntelligenceData {
  source: DataSource;
  generatedAt: string;
  filters: PqlFilters;
  status: SystemStatus;
  usageStages: UsageStageCard[];
  usersWithUsage: number;
  criticalSignals: CriticalSignalCard[];
  funnel: MonetizationStage[];
  biggestDropLabel: string | null;
  bands: PqlBand[];
  totalPqls: number;
  leads: UpgradeLead[];
  leadsTotal: number;
  leadReasons: LeadReason[];
  scoredUsers: number;
  nearLimit: NearLimitUser[];
  nearLimitTotal: number;
  markets: MarketRow[];
  triggers: TriggerRow[];
  /** Whether trigger rows count real prompt impressions or milestone arrivals. */
  triggerExposureBasis: "upgrade_prompt_shown" | "milestone_reached";
  experiments: ExperimentView[];
  countryOptions: FilterOption[];
  ownerOptions: FilterOption[];
}
