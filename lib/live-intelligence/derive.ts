import { eventDefinition } from "@/lib/events/catalog";
import type { Tone } from "@/lib/revenue-center/types";
import type { IntentFilter, LiveUser, PricingIntent, QuickAction, UserSegment } from "@/lib/live-intelligence/types";

// ---------------------------------------------------------------------------
// Pure derivations for Live User Intelligence. The table, filters, chips and
// session panel all read these - never their own ad-hoc rules.
// ---------------------------------------------------------------------------

// ----------------------------------------------------------------- pages & features

export const FEATURES = ["Job Feed", "Auto Apply", "Resume Analyzer", "Job Matching", "Pricing", "Profile", "Application Tracker"] as const;
export type Feature = (typeof FEATURES)[number];

const PAGE_RULES: { test: RegExp; label: string; feature: Feature | null }[] = [
  { test: /^\/(jobs|feed)(\/|$)/, label: "Job Feed", feature: "Job Feed" },
  { test: /^\/(auto-?apply)(\/|$)/, label: "Auto Apply", feature: "Auto Apply" },
  { test: /^\/(resume|resume-analyzer)(\/|$)/, label: "Resume Analyzer", feature: "Resume Analyzer" },
  { test: /^\/(matches|matching|job-matching)(\/|$)/, label: "Job Matching", feature: "Job Matching" },
  { test: /^\/(pricing|plans)(\/|$)/, label: "Pricing", feature: "Pricing" },
  { test: /^\/(checkout|billing)(\/|$)/, label: "Checkout", feature: "Pricing" },
  { test: /^\/(profile|onboarding|settings)(\/|$)/, label: "Profile", feature: "Profile" },
  { test: /^\/(applications|tracker)(\/|$)/, label: "Application Tracker", feature: "Application Tracker" },
  { test: /^\/?$/, label: "Dashboard", feature: null },
];

export function pageInfo(path: string | null): { label: string; feature: Feature | null } {
  if (!path) return { label: "—", feature: null };
  const clean = path.split(/[?#]/)[0]!.toLowerCase();
  const rule = PAGE_RULES.find((r) => r.test.test(clean));
  if (rule) return { label: rule.label, feature: rule.feature };
  const segment = clean.split("/").filter(Boolean)[0] ?? "";
  return { label: segment ? segment.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—", feature: null };
}

// ----------------------------------------------------------------- current action

export interface CurrentAction {
  label: string;
  kind: "activity" | "monetization" | "issue";
}

const ACTIONS: Record<string, CurrentAction> = {
  auto_apply_started: { label: "Auto Applying", kind: "activity" },
  auto_apply_success: { label: "Auto Applying", kind: "activity" },
  auto_apply_failed: { label: "Auto Apply failed", kind: "issue" },
  auto_apply_milestone: { label: "Auto Applying", kind: "activity" },
  pricing_viewed: { label: "Viewing Pricing", kind: "monetization" },
  plan_compared: { label: "Comparing Plans", kind: "monetization" },
  pro_clicked: { label: "Selecting Pro", kind: "monetization" },
  premium_clicked: { label: "Selecting Premium", kind: "monetization" },
  checkout_started: { label: "Payment details", kind: "monetization" },
  resume_uploaded: { label: "Resume update", kind: "activity" },
  resume_updated: { label: "Resume update", kind: "activity" },
  resume_tailored: { label: "Tailoring resume", kind: "activity" },
  resume_analyzed: { label: "Resume review", kind: "activity" },
  job_viewed: { label: "Viewing matches", kind: "activity" },
  job_saved: { label: "Saving jobs", kind: "activity" },
  search_performed: { label: "Searching jobs", kind: "activity" },
  filter_used: { label: "Searching jobs", kind: "activity" },
  apply_clicked: { label: "Applying manually", kind: "activity" },
  login: { label: "Browsing", kind: "activity" },
  onboarding_step_completed: { label: "Onboarding", kind: "activity" },
  signup_completed: { label: "Onboarding", kind: "activity" },
  preference_added: { label: "Edit profile", kind: "activity" },
};

export function currentAction(user: Pick<LiveUser, "lastEventName" | "currentPage">): CurrentAction {
  if (user.lastEventName && ACTIONS[user.lastEventName]) return ACTIONS[user.lastEventName]!;
  const page = pageInfo(user.currentPage);
  if (page.feature === "Pricing") return { label: "Viewing Pricing", kind: "monetization" };
  if (page.feature === "Profile") return { label: "Edit profile", kind: "activity" };
  return { label: page.label === "—" ? "Browsing" : `On ${page.label}`, kind: "activity" };
}

export const lastEventLabel = (name: string | null) => (name ? eventDefinition(name).label || name.replace(/_/g, " ") : "—");

// ----------------------------------------------------------------- purchase intent

export const INTENT_META: Record<PricingIntent, { label: string; short: string; tone: Tone; rank: number }> = {
  low: { label: "Low", short: "Low", tone: "slate", rank: 0 },
  medium: { label: "Medium", short: "Medium", tone: "blue", rank: 1 },
  high: { label: "High", short: "High", tone: "orange", rank: 2 },
  viewed_premium: { label: "Viewed Premium", short: "Viewed Premium", tone: "orange", rank: 3 },
  plan_selected: { label: "Plan Selected", short: "Plan Selected", tone: "orange", rank: 4 },
  checkout_started: { label: "Checkout Started", short: "Checkout", tone: "orange", rank: 5 },
  payment_failed: { label: "Payment Failed", short: "Payment Failed", tone: "red", rank: 6 },
};

export function pricingIntent(u: Pick<LiveUser, "paymentFailed" | "checkoutStarted30d" | "checkoutAbandoned" | "planClicks30d" | "lastPremiumClick" | "pricingViews30d">): PricingIntent {
  if (u.paymentFailed) return "payment_failed";
  if (u.checkoutStarted30d > 0 || u.checkoutAbandoned) return "checkout_started";
  if (u.lastPremiumClick) return "viewed_premium";
  if (u.planClicks30d > 0) return "plan_selected";
  if (u.pricingViews30d >= 3) return "high";
  if (u.pricingViews30d >= 1) return "medium";
  return "low";
}

// ----------------------------------------------------------------- segments

export const SEGMENT_META: Record<UserSegment, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "green" },
  onboarded: { label: "Onboarded", tone: "teal" },
  activated: { label: "Activated", tone: "teal" },
  engaged: { label: "Engaged", tone: "blue" },
  power_user: { label: "Power User", tone: "purple" },
  pql: { label: "PQL", tone: "indigo" },
  near_limit: { label: "Near Limit", tone: "amber" },
  quota_exhausted: { label: "Quota Exhausted", tone: "red" },
  checkout_intent: { label: "Checkout Intent", tone: "purple" },
  dormant: { label: "Dormant", tone: "red" },
  resurrected: { label: "Resurrected", tone: "slate" },
  paid: { label: "Paid", tone: "green" },
};

export const SEGMENT_FILTERS: UserSegment[] = [
  "new",
  "activated",
  "engaged",
  "power_user",
  "pql",
  "near_limit",
  "quota_exhausted",
  "checkout_intent",
  "dormant",
  "resurrected",
  "paid",
];

/** Every segment a user belongs to (lifecycle stage + usage/intent signals). */
export function userSegments(u: LiveUser): UserSegment[] {
  const out = new Set<UserSegment>();
  const stage = u.lifecycleStage as UserSegment;
  if (stage in SEGMENT_META) out.add(stage);
  if (!u.isPaid && u.autoAppliesUsed >= u.autoApplyLimit) out.add("quota_exhausted");
  else if (!u.isPaid && u.autoAppliesUsed >= 45) out.add("near_limit");
  if (!u.isPaid && (u.checkoutStarted30d > 0 || u.checkoutAbandoned)) out.add("checkout_intent");
  if (u.isPaid) out.add("paid");
  return [...out];
}

/** The single badge shown next to a user: monetization signals beat lifecycle. */
export function primarySegment(u: LiveUser): UserSegment {
  const segs = userSegments(u);
  for (const s of ["quota_exhausted", "checkout_intent", "near_limit", "paid", "pql", "resurrected", "dormant", "power_user", "engaged", "activated", "new"] as const) {
    if (segs.includes(s)) return s;
  }
  return segs[0] ?? "new";
}

// ----------------------------------------------------------------- product issues & actions

export const REPEATED_FAILURE_MIN = 3;
export const hasProductIssue = (u: Pick<LiveUser, "autoApplyFailures7d">) => u.autoApplyFailures7d >= REPEATED_FAILURE_MIN;

export function quickAction(u: LiveUser): QuickAction {
  if (hasProductIssue(u) && u.priority !== "P0") return "investigate";
  if (u.priority && !u.ownerId && u.priority !== "P0") return "assign";
  if (u.priority === "P0" || ["call_now", "checkout_recovery", "payment_recovery", "send_whatsapp"].includes(u.nextBestAction ?? "")) return "call";
  if (u.pqlScore >= 75 && !u.ownerId) return "assign";
  return "view";
}

export const NEXT_ACTION_LABEL: Record<string, string> = {
  call_now: "Call now",
  checkout_recovery: "Recover checkout",
  payment_recovery: "Recover payment",
  send_whatsapp: "Follow up on WhatsApp",
  route_to_product_support: "Investigate product issue",
  show_upgrade_prompt: "Assign to sales",
  win_back_campaign: "Win-back campaign",
  send_activation_reminder: "Send activation reminder",
  continue_product_nurture: "Keep nurturing",
  do_nothing: "No action needed",
};

export function usageTone(used: number, limit: number): Tone {
  if (used >= limit) return "red";
  if (used >= 45) return "amber";
  if (used >= 40) return "amber";
  return "teal";
}

// ----------------------------------------------------------------- intent filters

export const INTENT_FILTERS: { key: IntentFilter; label: string; tone: Tone; test: (u: LiveUser, todayStartMs: number) => boolean }[] = [
  { key: "visited_pricing", label: "Visited Pricing", tone: "purple", test: (u) => u.pricingViews30d > 0 },
  { key: "plan_clicked", label: "Plan Clicked", tone: "blue", test: (u) => u.planClicks30d > 0 || u.lastPremiumClick },
  { key: "checkout_started", label: "Checkout Started", tone: "amber", test: (u) => u.checkoutStarted30d > 0 || u.checkoutAbandoned },
  { key: "payment_failed", label: "Payment Failed", tone: "red", test: (u) => u.paymentFailed },
  { key: "apps_40", label: "40+ Applications", tone: "blue", test: (u) => u.autoAppliesUsed >= 40 },
  { key: "apps_45", label: "45+ Applications", tone: "green", test: (u) => u.autoAppliesUsed >= 45 },
  { key: "limit_50", label: "50/50 Limit", tone: "red", test: (u) => u.autoAppliesUsed >= u.autoApplyLimit },
  { key: "returned_dormant", label: "Returned Dormant User", tone: "slate", test: (u) => u.lifecycleStage === "resurrected" },
  { key: "repeated_failure", label: "Repeated Failure", tone: "blue", test: (u) => hasProductIssue(u) },
  { key: "new_today", label: "New User Today", tone: "slate", test: (u, today) => !!u.signupAt && Date.parse(u.signupAt) >= today },
];

// ----------------------------------------------------------------- filter state

export type StatusFilter = "all" | "online" | "idle";
export type WindowFilter = "today" | "7d";
export type RecencyFilter = "any" | "15m" | "1h" | "24h";
export type PqlFilter = "any" | "90" | "80" | "60-89" | "lt60";

export interface LiveFilterState {
  status: StatusFilter;
  window: WindowFilter;
  recency: RecencyFilter;
  country: string;
  segment: UserSegment | "";
  plan: string;
  intent: IntentFilter | "";
  pql: PqlFilter;
  source: string;
  chips: IntentFilter[];
  segmentChips: UserSegment[];
}

export const DEFAULT_FILTERS: LiveFilterState = {
  status: "all",
  window: "today",
  recency: "any",
  country: "",
  segment: "",
  plan: "",
  intent: "",
  pql: "any",
  source: "",
  chips: [],
  segmentChips: [],
};

export const isDefaultFilters = (f: LiveFilterState) =>
  JSON.stringify({ ...f, chips: [...f.chips].sort(), segmentChips: [...f.segmentChips].sort() }) === JSON.stringify(DEFAULT_FILTERS);

const RECENCY_MS: Record<Exclude<RecencyFilter, "any">, number> = { "15m": 15 * 60_000, "1h": 3_600_000, "24h": 86_400_000 };

const pqlMatches = (score: number, f: PqlFilter) =>
  f === "any" || (f === "90" && score >= 90) || (f === "80" && score >= 80) || (f === "60-89" && score >= 60 && score < 90) || (f === "lt60" && score < 60);

/** All filters combine with AND; chips within a group also AND (a cohort narrows). */
export function applyLiveFilters(users: LiveUser[], f: LiveFilterState, nowMs: number, todayStartMs: number): LiveUser[] {
  const intentTests = new Map(INTENT_FILTERS.map((i) => [i.key, i.test]));
  const intents = [...new Set([...(f.intent ? [f.intent] : []), ...f.chips])];
  const segments = [...new Set([...(f.segment ? [f.segment] : []), ...f.segmentChips])];
  return users.filter((u) => {
    if (f.status === "online" && !u.isOnline) return false;
    if (f.status === "idle" && u.isOnline) return false;
    const seen = u.lastSeenAt ? Date.parse(u.lastSeenAt) : 0;
    if (f.window === "today" && !u.isOnline && seen < todayStartMs) return false;
    if (f.recency !== "any" && !u.isOnline && nowMs - seen > RECENCY_MS[f.recency]) return false;
    if (f.country && u.country !== f.country) return false;
    if (f.plan && u.plan !== f.plan) return false;
    if (f.source && (u.source ?? "").toLowerCase() !== f.source) return false;
    if (!pqlMatches(u.pqlScore, f.pql)) return false;
    if (intents.some((key) => !intentTests.get(key)!(u, todayStartMs))) return false;
    if (segments.length) {
      const mine = userSegments(u);
      if (segments.some((s) => !mine.includes(s))) return false;
    }
    return true;
  });
}

/** Ranking: online first, then priority, PQL score, most recent activity. */
export function rankLiveUsers(users: LiveUser[]): LiveUser[] {
  const prio = (p: LiveUser["priority"]) => (p === "P0" ? 0 : p === "P1" ? 1 : p === "P2" ? 2 : 3);
  return [...users].sort(
    (a, b) =>
      Number(b.isOnline) - Number(a.isOnline) ||
      prio(a.priority) - prio(b.priority) ||
      b.pqlScore - a.pqlScore ||
      (b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0) - (a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0)
  );
}
