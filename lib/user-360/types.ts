import type { DataSource, FilterOption, IconKey, Tone } from "@/lib/revenue-center/types";

// ---------------------------------------------------------------------------
// User 360 view-model. lib/user-360/load.ts fills it from the analytics
// database; lib/user-360/mock.ts from demo data. Components only see this.
// ---------------------------------------------------------------------------

export const PROFILE_TABS = ["overview", "sessions", "applications", "subscription", "sales", "support", "raw"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const TAB_LABELS: Record<ProfileTab, string> = {
  overview: "Overview",
  sessions: "Sessions",
  applications: "Applications",
  subscription: "Subscription Intent",
  sales: "Sales Activity",
  support: "Support",
  raw: "Raw Events",
};

export interface ProfileMetric {
  key: string;
  label: string;
  value: string;
  icon: IconKey;
  tone: Tone;
  /** Relative change vs the previous 30 days; null when there is no basis. */
  trendPct: number | null;
  secondary: string | null;
  bar: { used: number; limit: number } | null;
  definition: string;
}

export interface UsageItem {
  label: string;
  value: string | null;
  icon: IconKey;
  /** 0-100 for a progress bar, when the value is a ratio. */
  progress: number | null;
  state: "yes" | "no" | "neutral";
}

export interface AcquisitionItem {
  label: string;
  value: string | null;
  icon: IconKey;
  mono?: boolean;
}

export interface HealthItem {
  label: string;
  severity: "ok" | "warn" | "bad";
}

export type ApplicationOutcome = "submitted" | "failed" | "blocked" | "in_progress" | "manual";

export interface ApplicationRow {
  id: string;
  company: string | null;
  title: string | null;
  jobUrl: string | null;
  startedAt: string;
  finishedAt: string | null;
  outcome: ApplicationOutcome;
  reason: string | null;
  platform: string | null;
}

export interface SessionEvent {
  id: string;
  at: string;
  label: string;
  category: string;
  tone: Tone;
  outcome: "success" | "failed" | null;
  monetization: boolean;
}

export interface SessionCard {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  device: string | null;
  isCurrent: boolean;
  eventCount: number;
  events: SessionEvent[];
}

export interface IntentStep {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  emphasis: boolean;
}

export interface PqlSignal {
  label: string;
  points: number;
  tag: string | null;
}

export interface SalesEngagement {
  leadId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: string;
  leadCreatedAt: string | null;
  slaDueAt: string | null;
  lastContactAt: string | null;
  counts: { call: number; whatsapp: number; email: number; note: number };
  pendingCallbacks: { id: string; due_at: string; notes: string | null }[];
}

export interface SalesActivityEntry {
  id: string;
  type: string;
  summary: string;
  actorName: string | null;
  at: string;
}

export interface SupportSignals {
  status: "Healthy" | "Needs attention";
  autoApplyFailuresLifetime: number;
  autoApplyFailures7d: number;
  paymentFailures: number;
  errors7d: number;
  blocked: number;
  openAlerts: { id: string; title: string; priority: string; created_at: string }[];
  ticketsConnected: false;
}

export interface RawEventRow {
  id: string;
  name: string;
  label: string;
  at: string;
  page: string | null;
  source: string;
  properties: Record<string, unknown>;
}

export interface ProfileUser {
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
  lastActiveAt: string | null;
  signupAt: string | null;
  targetRole: string | null;
  experience: string | null;
  lifecycleStage: string;
  pqlScore: number;
  pqlCategory: string;
  priority: "P0" | "P1" | "P2" | null;
  priorityReason: string | null;
  nextBestAction: string | null;
  firstTouch: string | null;
  campaign: string | null;
}

export interface UserProfileData {
  source: DataSource;
  generatedAt: string;
  user: ProfileUser;
  metrics: ProfileMetric[];
  usage: UsageItem[];
  acquisition: AcquisitionItem[];
  health: { status: "Healthy" | "Needs attention"; items: HealthItem[] };
  sessions: SessionCard[];
  intent: {
    steps: IntentStep[];
    recommendedPlan: string;
    firstPricingViewAt: string | null;
    lastPricingViewDate: string | null;
    subscriptions: { subscription_id: string; plan: string | null; status: string; amount: number | null; started_at: string | null }[];
    payments: { successful: number; failed: number; lifetimeRevenue: number; lastSuccessAt: string | null; lastFailureAt: string | null };
  };
  pqlSignals: { positive: PqlSignal[]; negative: PqlSignal[] };
  sales: SalesEngagement;
  salesActivities: SalesActivityEntry[];
  applications: ApplicationRow[];
  support: SupportSignals;
  rawEvents: { rows: RawEventRow[]; nextCursor: string | null };
  team: FilterOption[];
}

export interface DirectoryRow {
  userId: string;
  displayId: string;
  name: string;
  email: string | null;
  country: string | null;
  plan: string;
  isPaid: boolean;
  isOnline: boolean;
  lifecycleStage: string;
  pqlScore: number;
  priority: "P0" | "P1" | "P2" | null;
  autoApplyUsed: number;
  autoApplyLimit: number;
  lastActiveAt: string | null;
  ownerName: string | null;
}

export interface DirectoryData {
  source: DataSource;
  generatedAt: string;
  query: string;
  rows: DirectoryRow[];
  total: number;
}
