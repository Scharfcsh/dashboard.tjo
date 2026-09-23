// ---------------------------------------------------------------------------
// The Revenue Command Center view-model. Components consume only these types;
// lib/revenue-center/load.ts fills them from the live analytics database, and
// lib/mock-data.ts fills them with demo data. Neither source leaks into JSX.
// ---------------------------------------------------------------------------

export type RangePreset = "today" | "7d" | "30d" | "90d";
export type FunnelRange = "today" | "7d" | "30d";
export type ChartDays = 7 | 30 | 90;

export interface DashboardFilters {
  range: RangePreset;
  country: string | null;
  source: string | null;
  funnel: FunnelRange;
  chart: ChartDays;
}

export type DataSource = { kind: "live" } | { kind: "demo"; reason: string };

export type Tone = "teal" | "blue" | "indigo" | "purple" | "amber" | "orange" | "red" | "green" | "slate";

export type IconKey =
  | "users"
  | "activity"
  | "flame"
  | "eye"
  | "cart"
  | "wallet"
  | "file"
  | "alert"
  | "x-circle"
  | "moon"
  | "refresh"
  | "zap"
  | "target"
  | "sparkles"
  | "tag"
  | "credit-card"
  | "user-check"
  | "calendar"
  | "filter"
  | "gauge"
  | "coins"
  | "leaf"
  | "chart"
  | "crown"
  | "trending-up"
  | "check-circle"
  | "flask"
  | "globe";

/** Quick filters the opportunity table understands; KPI cards set them. */
export type OpportunityFocus = "hot" | "pricing" | "checkout" | "quota" | "usage40" | "usage45" | "payment_failed" | "online";

export interface KpiCardData {
  key: string;
  label: string;
  icon: IconKey;
  tone: Tone;
  value: number;
  format: "number" | "currency";
  /** Secondary line under the value, e.g. "+43 today". */
  secondary: string | null;
  secondaryTone?: Tone;
  /** Relative change vs the previous period, in percent. Null hides the pill. */
  changePct: number | null;
  badge: { label: string; tone: Tone } | null;
  focus: OpportunityFocus | null;
  definition: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  icon: IconKey;
  tone: Tone;
  count: number;
  independentCount: number;
  conversionFromPrevious: number | null;
  conversionFromStart: number | null;
}

export type AlertSeverity = "critical" | "warning" | "opportunity" | "recovery";

export interface AlertGroup {
  id: string;
  text: string;
  severity: AlertSeverity;
  icon: IconKey;
  tone: Tone;
  count: number;
  latestAt: string;
}

export type CheckoutStatus = "not_started" | "plan_selected" | "started" | "abandoned";
export type PrimaryAction = "call_now" | "follow_up" | "recover";

export interface OpportunityRow {
  userId: string;
  displayId: string;
  name: string;
  country: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  autoApplyUsed: number;
  autoApplyLimit: number;
  pricingViews: number;
  checkoutStatus: CheckoutStatus;
  checkoutLabel: string;
  paymentFailed: boolean;
  pqlScore: number;
  priority: "P0" | "P1" | "P2" | null;
  whyHot: string;
  ownerName: string | null;
  lastContactAt: string | null;
  action: PrimaryAction;
  leadId: string | null;
}

export interface GrowthPoint {
  date: string;
  active: number;
  pqls: number;
  paid: number;
}

export interface SalesTeamData {
  pipeline: { key: string; label: string; value: number }[];
  performers: { name: string; contacts: number }[];
}

export interface IntelligenceMetric {
  key: string;
  label: string;
  icon: IconKey;
  tone: Tone;
  value: number | null;
  format: "percent" | "number" | "currency";
  /** Rates: change in percentage points. Counts/currency: relative change in percent. */
  change: number | null;
  changeUnit: "pts" | "%";
  definition: string;
}

export interface SystemStatus {
  state: "operational" | "delayed" | "demo";
  label: string;
  detail: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface RevenueCommandCenterData {
  source: DataSource;
  generatedAt: string;
  filters: DashboardFilters;
  status: SystemStatus;
  kpis: KpiCardData[];
  secondaryKpis: KpiCardData[];
  funnel: FunnelStage[];
  alerts: AlertGroup[];
  openAlertCount: number;
  opportunities: OpportunityRow[];
  opportunitiesTotal: number;
  growth: GrowthPoint[];
  salesTeam: SalesTeamData;
  intelligence: IntelligenceMetric[];
  countryOptions: FilterOption[];
  sourceOptions: FilterOption[];
}

// --------------------------------------------------------------------------- User 360

export interface TimelineEvent {
  id: string;
  at: string;
  label: string;
  detail: string | null;
  tone: Tone;
}

export interface ContactEntry {
  id: string;
  type: "call" | "whatsapp" | "email" | "note" | "disposition";
  summary: string;
  actorName: string | null;
  at: string;
}

export interface User360View {
  userId: string;
  displayId: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  plan: string;
  isPaid: boolean;
  isOnline: boolean;
  lifecycleStage: string;
  signupAt: string | null;
  lastActiveAt: string | null;
  acquisition: { source: string | null; campaign: string | null };
  pql: {
    score: number;
    category: string;
    priority: "P0" | "P1" | "P2" | null;
    reason: string | null;
    nextBestAction: string | null;
    reasons: { label: string; points: number }[];
  } | null;
  autoApply: { used: number; limit: number; successful: number; failed: number };
  intent: { pricingViews: number; planClicks: number; checkoutsStarted: number; checkoutsAbandoned: number };
  session: { startedAt: string; durationSeconds: number; device: string | null; isCurrent: boolean } | null;
  activity: TimelineEvent[];
  sales: {
    leadId: string | null;
    leadStatus: string | null;
    ownerId: string | null;
    ownerName: string | null;
    lastContactAt: string | null;
    contacts: ContactEntry[];
  };
  team: FilterOption[];
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
