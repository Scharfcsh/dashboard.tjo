import type { DataSource, FilterOption, IconKey, Tone } from "@/lib/revenue-center/types";

// ---------------------------------------------------------------------------
// Dashboard 5 view-model. Components consume only these types: the live loader
// and the demo dataset both produce this exact shape. Icons cross the boundary
// as IconKey, tones as Tone.
// ---------------------------------------------------------------------------

export type SalesRange = "today" | "7d" | "30d";

export interface SalesFilters {
  /** team_members.id of the person whose workspace this is. */
  caller: string | null;
  range: SalesRange;
  /** Lead selected in the detail rail; null means "whoever is up next". */
  lead: string | null;
  status: "open" | "all";
}

export interface CallerIdentity {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  /** A sales_manager also sees the team panels and may assign leads. */
  isManager: boolean;
  active: boolean;
  email: string | null;
}

export interface SalesKpi {
  key: string;
  label: string;
  value: number;
  format: "number" | "currency";
  icon: IconKey;
  tone: Tone;
  /** Line under the value: a delta, a rate, or a plain caption. */
  caption: string | null;
  captionTone: Tone | null;
  definition: string;
}

export interface PoolSegment {
  key: string;
  label: string;
  action: string;
  users: number;
  sharePct: number | null;
  tone: Tone;
}

export type LeadPriority = "P0" | "P1" | "P2";

export interface QueueLead {
  leadId: string;
  userId: string;
  name: string;
  priority: LeadPriority | null;
  pqlScore: number;
  reason: string;
  autoApplyUsed: number;
  autoApplyLimit: number;
  /** Pricing intent as a caller-facing word, not a raw count. */
  pricingIntent: "Very High" | "High" | "Medium" | "Low";
  pricingViews: number;
  lastActiveAt: string | null;
  lastContactAt: string | null;
  statusLabel: string;
  statusTone: Tone;
  nextAction: "call" | "whatsapp" | "email";
  slaDueAt: string | null;
  slaBreached: boolean;
  /** A connected call that still needs a disposition blocks everything else. */
  pendingDisposition: boolean;
  callbackDueAt: string | null;
  callbackIsDue: boolean;
  isOnline: boolean;
  country: string | null;
}

export interface CallNextLead extends QueueLead {
  role: string | null;
  city: string | null;
  planInterest: string | null;
  checkoutLabel: string;
  freeApplicationsLeft: number;
  pitch: string;
  why: string[];
  /** Why this lead is at the top of the queue right now. */
  queuedBecause: string;
}

export interface FollowUp {
  callbackId: string;
  leadId: string;
  userId: string;
  name: string;
  dueAt: string;
  isDue: boolean;
  notes: string | null;
  priority: LeadPriority | null;
  reason: string | null;
}

export interface PipelineStage {
  key: string;
  label: string;
  leads: number;
  tone: Tone;
}

export interface LeaderboardRow {
  callerId: string;
  name: string;
  role: string;
  leads: number;
  calls: number;
  connections: number;
  interested: number;
  conversions: number;
  revenue: number;
  conversionRatePct: number | null;
  isSelf: boolean;
}

export interface SlaMetric {
  key: string;
  label: string;
  value: string;
  target: string | null;
  tone: Tone;
  /** Set when the number needs a human to do something. */
  callToAction: string | null;
}

export interface LeadActivity {
  id: string;
  type: "call" | "whatsapp" | "email" | "note" | "disposition";
  summary: string;
  detail: string | null;
  actorName: string;
  at: string;
  durationSeconds: number | null;
}

export interface LeadSession {
  id: string;
  startedAt: string;
  summary: string;
}

export interface LeadDetail {
  leadId: string;
  userId: string;
  name: string;
  /** Masked until the caller acts; the real values never reach the page. */
  emailMasked: string | null;
  phoneMasked: string | null;
  role: string | null;
  location: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
  isOnline: boolean;
  priority: LeadPriority | null;
  pqlScore: number;
  statusLabel: string;
  whyHot: string[];
  usage: { label: string; value: string; bar?: { used: number; limit: number } }[];
  pricing: { label: string; value: string }[];
  sessions: LeadSession[];
  activities: LeadActivity[];
  notes: LeadActivity[];
  pitch: string;
  nextAction: string;
  nextActionLabel: string;
  pendingDisposition: boolean;
}

export interface SalesCrmData {
  source: DataSource;
  generatedAt: string;
  filters: SalesFilters;
  caller: CallerIdentity;
  callerOptions: FilterOption[];
  kpis: SalesKpi[];
  poolSegments: PoolSegment[];
  poolActiveUsers: number;
  callNext: CallNextLead | null;
  /** Set when the queue is empty because nothing has been assigned yet. */
  unassignedOpenLeads: number;
  queue: QueueLead[];
  queueTotal: number;
  followUps: FollowUp[];
  pipeline: PipelineStage[];
  pipelineTotal: number;
  selectedLead: LeadDetail | null;
  openAlerts: number;
  /** Manager-only panels; empty for a caller. */
  leaderboard: LeaderboardRow[];
  sla: SlaMetric[];
}
