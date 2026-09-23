import type { DataSource, FilterOption, TimelineEvent, Tone } from "@/lib/revenue-center/types";

// ---------------------------------------------------------------------------
// Live User Intelligence view-model. lib/live-intelligence/load.ts fills it from
// the analytics database, lib/live-intelligence/mock.ts from demo data.
// Derived labels (current action, intent, segment…) come from derive.ts so the
// two sources can never disagree about what a state means.
// ---------------------------------------------------------------------------

export type PricingIntent = "low" | "medium" | "high" | "viewed_premium" | "plan_selected" | "checkout_started" | "payment_failed";

export type UserSegment =
  | "new"
  | "onboarded"
  | "activated"
  | "engaged"
  | "power_user"
  | "pql"
  | "near_limit"
  | "quota_exhausted"
  | "checkout_intent"
  | "dormant"
  | "resurrected"
  | "paid";

export type IntentFilter =
  | "visited_pricing"
  | "plan_clicked"
  | "checkout_started"
  | "payment_failed"
  | "apps_40"
  | "apps_45"
  | "limit_50"
  | "returned_dormant"
  | "repeated_failure"
  | "new_today";

export type QuickAction = "call" | "assign" | "investigate" | "view";

/** Raw per-user facts; everything shown in the table is derived from these. */
export interface LiveUser {
  userId: string;
  displayId: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  plan: string;
  isPaid: boolean;
  source: string | null;
  lifecycleStage: string;
  signupAt: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  currentPage: string | null;
  lastEventName: string | null;
  sessionStartedAt: string | null;
  autoAppliesUsed: number;
  autoApplyLimit: number;
  autoApplyFailures7d: number;
  pricingViews30d: number;
  planClicks30d: number;
  checkoutStarted30d: number;
  checkoutAbandoned: boolean;
  paymentFailed: boolean;
  lastPremiumClick: boolean;
  pqlScore: number;
  priority: "P0" | "P1" | "P2" | null;
  nextBestAction: string | null;
  ownerId: string | null;
  ownerName: string | null;
}

export interface LiveKpis {
  onlineNow: number;
  activeToday: number;
  active7d: number;
  sessionsToday: number;
  highIntentActive: number;
  pricingActivity: number;
  nearFreeLimit: number;
}

export type EventCategory = "opportunity" | "high_intent" | "conversion" | "activation" | "retention" | "product_issue" | "revenue_recovery";

export interface LiveEvent {
  id: string;
  userId: string | null;
  displayId: string;
  text: string;
  category: EventCategory;
  at: string;
}

export interface SessionBucket {
  key: string;
  label: string;
  count: number;
}

export interface FeatureUsageRow {
  feature: string;
  users: number;
}

export interface LiveSession {
  userId: string;
  sessionId: string;
  startedAt: string;
  isOnline: boolean;
  sessionNumber: number | null;
  device: string | null;
  browser: string | null;
  events: (TimelineEvent & { eventName: string; page: string | null; properties: Record<string, unknown>; monetization: boolean })[];
}

export interface LiveIntelligenceData {
  source: DataSource;
  generatedAt: string;
  /** Start of today in the business timezone (UTC ISO), for "new user today". */
  todayStart: string;
  query: string;
  kpis: LiveKpis;
  users: LiveUser[];
  events: LiveEvent[];
  sessionBuckets: SessionBucket[];
  featureUsage: FeatureUsageRow[];
  countryOptions: FilterOption[];
  sourceOptions: FilterOption[];
  planOptions: FilterOption[];
}

export type { Tone };
