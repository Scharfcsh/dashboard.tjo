import { conversionRate, confidence, relativeLift } from "@/lib/experiments/stats";
import {
  bestVariant,
  checkoutPresentation,
  experimentStatusLabel,
  leadAction,
  remaining,
  successRate,
} from "@/lib/pql-intelligence/derive";
import { USAGE_BOUNDS } from "@/lib/pql-intelligence/filters";
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
import type { IconKey, Tone } from "@/lib/revenue-center/types";

// ---------------------------------------------------------------------------
// Demo dataset for Dashboard 4 - the approved reference, made internally
// consistent: counts are the reference's, every percentage, drop-off, lift and
// confidence is computed from those counts by the same functions the live
// loader uses. Deterministic (no Math.random, no `new Date()` inside values) so
// server and client markup match.
// ---------------------------------------------------------------------------

const MINUTE = 60_000;

const STAGES: { key: string; title: string; label: string; users: number; icon: IconKey; tone: Tone }[] = [
  { key: "0-10", title: "0–10 Used", label: "Early Users", users: 824, icon: "users", tone: "blue" },
  { key: "11-25", title: "11–25 Used", label: "Developing Value", users: 284, icon: "leaf", tone: "teal" },
  { key: "26-39", title: "26–39 Used", label: "Engaged", users: 117, icon: "chart", tone: "purple" },
  { key: "40-44", title: "40–44 Used", label: "Warm", users: 39, icon: "flame", tone: "amber" },
  { key: "45-49", title: "45–49 Used", label: "Hot", users: 18, icon: "target", tone: "orange" },
  { key: "50", title: "50 / 50 Used", label: "Immediate Upgrade Opportunity", users: 21, icon: "crown", tone: "red" },
];

const USERS_WITH_USAGE = STAGES.reduce((a, s) => a + s.users, 0);

const usageStageCards = (): UsageStageCard[] =>
  STAGES.map((s) => ({
    key: s.key,
    title: s.title,
    label: s.label,
    users: s.users,
    sharePct: Math.round((s.users / USERS_WITH_USAGE) * 1000) / 10,
    icon: s.icon,
    tone: s.tone,
    usage: s.key as UsageStageCard["usage"],
  }));

const CRITICAL: CriticalSignalCard[] = [
  { key: "quota_unpaid", title: "50/50 + Not Paid", caption: "Reached the limit, not converted", value: 17, icon: "alert", tone: "red", filter: { usage: "50" } },
  { key: "near_limit_pricing", title: "45+ + Pricing Viewed", caption: "High purchase intent", value: 11, icon: "trending-up", tone: "amber", filter: { usage: "45-49", intent: "viewed" } },
  { key: "checkout_abandoned", title: "Checkout Abandoned", caption: "Started checkout, did not finish", value: 5, icon: "cart", tone: "purple", filter: { intent: "abandoned" } },
  { key: "payment_failed", title: "Payment Failed", caption: "Payment error, retry needed", value: 2, icon: "x-circle", tone: "red", filter: { intent: "checkout" } },
  { key: "hot_unassigned", title: "Hot PQLs Unassigned", caption: "Needs a sales owner", value: 7, icon: "users", tone: "blue", filter: { score: "75", leadStatus: "unassigned" } },
  { key: "converted_after_limit", title: "Converted After Limit", caption: "Paid after reaching 50", value: 6, icon: "check-circle", tone: "green", filter: null },
];

const FUNNEL_COUNTS: { key: string; label: string; users: number; icon: IconKey; tone: Tone }[] = [
  { key: "started_auto_apply", label: "Started Auto Apply", users: 1488, icon: "zap", tone: "blue" },
  { key: "used_10", label: "10 Applications", users: 1102, icon: "file", tone: "blue" },
  { key: "used_25", label: "25 Applications", users: 707, icon: "file", tone: "indigo" },
  { key: "used_40", label: "40 Applications", users: 442, icon: "flame", tone: "purple" },
  { key: "used_45", label: "45 Applications", users: 275, icon: "flame", tone: "amber" },
  { key: "used_50", label: "50 Applications", users: 163, icon: "crown", tone: "orange" },
  { key: "pricing_viewed", label: "Pricing Viewed", users: 96, icon: "eye", tone: "amber" },
  { key: "checkout_started", label: "Checkout", users: 48, icon: "cart", tone: "red" },
  { key: "paid", label: "Paid", users: 28, icon: "wallet", tone: "green" },
];

function funnel(): { stages: MonetizationStage[]; biggestDropLabel: string | null } {
  const start = FUNNEL_COUNTS[0]!.users;
  const drops = FUNNEL_COUNTS.map((s, i) =>
    i === 0 ? null : Math.round((s.users / FUNNEL_COUNTS[i - 1]!.users - 1) * 1000) / 10
  );
  let worst = -1;
  drops.forEach((d, i) => {
    if (d !== null && (worst === -1 || d < drops[worst]!)) worst = i;
  });
  return {
    stages: FUNNEL_COUNTS.map((s, i) => ({
      key: s.key,
      label: s.label,
      icon: s.icon,
      tone: s.tone,
      users: s.users,
      conversionFromStart: Math.round((s.users / start) * 1000) / 10,
      dropFromPrevious: drops[i],
      isBiggestDrop: i === worst,
    })),
    biggestDropLabel: worst === -1 ? null : FUNNEL_COUNTS[worst]!.label,
  };
}

const BANDS: PqlBand[] = [
  { category: "buy_now", label: "Buy Now", range: "90–100", users: 87, sharePct: 19.9, tone: "green" },
  { category: "hot", label: "Hot", range: "75–89", users: 118, sharePct: 27, tone: "red" },
  { category: "warm", label: "Warm", range: "60–74", users: 112, sharePct: 25.6, tone: "amber" },
  { category: "engaged", label: "Engaged", range: "40–59", users: 86, sharePct: 19.7, tone: "blue" },
  { category: "early", label: "Early", range: "0–39", users: 34, sharePct: 7.8, tone: "slate" },
];

const TOTAL_PQLS = BANDS.reduce((a, b) => a + b.users, 0);

const SCORED_USERS = 437;

/** Labels are the real PQL rules (lib/scoring/pql-config.ts), not invented ones. */
const REASON_COUNTS: [string, string, number, number][] = [
  ["auto_apply_50", "50/50 free applies used", 20, 214],
  ["auto_apply_45", "45 free applies used", 10, 186],
  ["pricing_viewed_repeat", "Pricing viewed 2+ times", 8, 142],
  ["plan_clicked", "Plan clicked", 12, 96],
  ["checkout_started", "Checkout started", 20, 78],
  ["payment_failed", "Payment failed", 25, 52],
  ["sessions_3_in_7d", "3+ sessions in 7 days", 5, 48],
  ["returned_after_inactivity", "Returned after inactivity", 5, 41],
  ["auto_apply_40", "40 free applies used", 10, 36],
];

const leadReasons = (): LeadReason[] =>
  REASON_COUNTS.map(([ruleId, label, points, users]) => ({
    ruleId,
    label,
    points,
    users,
    sharePct: Math.round((users / SCORED_USERS) * 1000) / 10,
  }));

interface SeedLead {
  userId: string;
  name: string;
  country: string;
  priority: "P0" | "P1" | "P2";
  used: number;
  success: number;
  started: number;
  pricingViews: number;
  plan: string | null;
  checkout: string;
  score: number;
  reason: string;
  owner: string | null;
  nextBestAction: string;
  minutesAgo: number;
}

const SEED_LEADS: SeedLead[] = [
  { userId: "TJO-14882", name: "Vishal Sharma", country: "IN", priority: "P0", used: 50, success: 46, started: 50, pricingViews: 4, plan: "Pro", checkout: "abandoned", score: 96, reason: "Quota exhausted + checkout abandoned", owner: "Rahul", nextBestAction: "call_now", minutesAgo: 12 },
  { userId: "TJO-14921", name: "Emily Carter", country: "US", priority: "P0", used: 49, success: 44, started: 50, pricingViews: 5, plan: "Premium", checkout: "not_started", score: 94, reason: "1 application remaining + repeated pricing", owner: "Sneha", nextBestAction: "call_now", minutesAgo: 7 },
  { userId: "TJO-14877", name: "Aarav Mehta", country: "IN", priority: "P1", used: 48, success: 18, started: 48, pricingViews: 3, plan: "Pro", checkout: "not_started", score: 78, reason: "High usage + pricing viewed", owner: "Neha", nextBestAction: "send_whatsapp", minutesAgo: 18 },
  { userId: "TJO-14520", name: "John Davis", country: "GB", priority: "P1", used: 46, success: 24, started: 46, pricingViews: 2, plan: "Premium", checkout: "not_started", score: 71, reason: "High success rate + nearing limit", owner: "Ankit", nextBestAction: "send_whatsapp", minutesAgo: 62 },
  { userId: "TJO-15112", name: "Sana Khan", country: "CA", priority: "P2", used: 45, success: 18, started: 45, pricingViews: 2, plan: "Pro", checkout: "not_started", score: 66, reason: "45+ applications + active", owner: "Priya", nextBestAction: "show_upgrade_prompt", minutesAgo: 95 },
  { userId: "TJO-15044", name: "Rohit Singh", country: "IN", priority: "P0", used: 50, success: 41, started: 50, pricingViews: 6, plan: "Pro", checkout: "started", score: 92, reason: "Quota exhausted + checkout started", owner: null, nextBestAction: "checkout_recovery", minutesAgo: 12 },
  { userId: "TJO-14310", name: "Meera Nair", country: "IN", priority: "P0", used: 50, success: 39, started: 52, pricingViews: 3, plan: "Premium", checkout: "started", score: 90, reason: "Payment failed", owner: null, nextBestAction: "payment_recovery", minutesAgo: 34 },
  { userId: "TJO-15220", name: "Daniel Brooks", country: "US", priority: "P1", used: 44, success: 30, started: 44, pricingViews: 1, plan: null, checkout: "not_started", score: 69, reason: "40+ applications", owner: "Sneha", nextBestAction: "show_upgrade_prompt", minutesAgo: 140 },
  { userId: "TJO-14988", name: "Fatima Ali", country: "AE", priority: "P1", used: 47, success: 33, started: 49, pricingViews: 2, plan: "Pro", checkout: "plan_selected", score: 74, reason: "Plan clicked + nearing limit", owner: null, nextBestAction: "send_whatsapp", minutesAgo: 26 },
  { userId: "TJO-14655", name: "Arjun Kapoor", country: "IN", priority: "P2", used: 41, success: 22, started: 43, pricingViews: 0, plan: null, checkout: "not_started", score: 58, reason: "40+ applications", owner: "Neha", nextBestAction: "continue_product_nurture", minutesAgo: 320 },
  { userId: "TJO-15301", name: "Grace Wilson", country: "GB", priority: "P2", used: 38, success: 25, started: 38, pricingViews: 1, plan: null, checkout: "not_started", score: 52, reason: "Engaged, no pricing intent", owner: null, nextBestAction: "continue_product_nurture", minutesAgo: 410 },
  { userId: "TJO-15188", name: "Karan Patel", country: "IN", priority: "P1", used: 49, success: 35, started: 50, pricingViews: 4, plan: "Premium", checkout: "abandoned", score: 83, reason: "Checkout abandoned", owner: "Rahul", nextBestAction: "checkout_recovery", minutesAgo: 51 },
];

function mapSeedLead(l: SeedLead, nowMs: number): UpgradeLead {
  const checkout = checkoutPresentation(l.checkout);
  return {
    userId: l.userId,
    name: l.name,
    country: l.country,
    priority: l.priority,
    autoApplyUsed: l.used,
    autoApplyLimit: 50,
    remaining: remaining(l.used, 50),
    successRatePct: successRate(l.success, l.started),
    successCount: l.success,
    pricingViews: l.pricingViews,
    planClicked: l.plan,
    checkoutLabel: checkout.label,
    checkoutTone: checkout.tone,
    pqlScore: l.score,
    reason: l.reason,
    ownerName: l.owner,
    action: leadAction(l.nextBestAction, l.priority),
    isOnline: l.minutesAgo <= 5,
    lastActiveAt: new Date(nowMs - l.minutesAgo * MINUTE).toISOString(),
  };
}

const SCORE_MIN: Record<PqlFilters["score"], number> = { all: 60, "40": 40, "60": 60, "75": 75, "90": 90 };

/** The demo honours the filters, so the controls visibly do something. */
function filterLeads(leads: UpgradeLead[], f: PqlFilters): UpgradeLead[] {
  const bounds = USAGE_BOUNDS[f.usage];
  return leads.filter((l) => {
    if (f.country && l.country !== f.country) return false;
    if (bounds.min !== undefined && l.autoApplyUsed < bounds.min) return false;
    if (bounds.max !== undefined && l.autoApplyUsed > bounds.max) return false;
    if (l.pqlScore < SCORE_MIN[f.score]) return false;
    if (f.intent === "viewed" && l.pricingViews === 0) return false;
    if (f.intent === "plan_clicked" && l.planClicked === null) return false;
    if (f.intent === "checkout" && l.checkoutLabel === "Not started") return false;
    if (f.intent === "abandoned" && l.checkoutLabel !== "Abandoned") return false;
    if (f.intent === "none" && (l.pricingViews > 0 || l.planClicked !== null)) return false;
    if (f.owner && OWNER_IDS[l.ownerName ?? ""] !== f.owner) return false;
    if (f.leadStatus === "unassigned" && l.ownerName !== null) return false;
    if (f.leadStatus !== "all" && f.leadStatus !== "unassigned" && l.ownerName === null) return false;
    return true;
  });
}

const NEAR_LIMIT_SEED: { userId: string; name: string; used: number; score: number; priority: "P0" | "P1" | "P2"; minutesAgo: number }[] = [
  { userId: "TJO-15044", name: "Rohit Singh", used: 50, score: 92, priority: "P0", minutesAgo: 12 },
  { userId: "TJO-14882", name: "Vishal Sharma", used: 50, score: 96, priority: "P0", minutesAgo: 12 },
  { userId: "TJO-14921", name: "Emily Carter", used: 49, score: 94, priority: "P0", minutesAgo: 7 },
  { userId: "TJO-15188", name: "Karan Patel", used: 49, score: 83, priority: "P1", minutesAgo: 51 },
  { userId: "TJO-14877", name: "Aarav Mehta", used: 48, score: 78, priority: "P1", minutesAgo: 18 },
  { userId: "TJO-14988", name: "Fatima Ali", used: 47, score: 74, priority: "P1", minutesAgo: 26 },
  { userId: "TJO-14520", name: "John Davis", used: 46, score: 71, priority: "P1", minutesAgo: 62 },
  { userId: "TJO-15112", name: "Sana Khan", used: 45, score: 66, priority: "P2", minutesAgo: 95 },
  { userId: "TJO-15220", name: "Daniel Brooks", used: 44, score: 69, priority: "P1", minutesAgo: 140 },
  { userId: "TJO-14655", name: "Arjun Kapoor", used: 41, score: 58, priority: "P2", minutesAgo: 320 },
];

/** Cohort sizes behind each tab, so the tab counts do not depend on the sample above. */
const NEAR_LIMIT_TOTALS: Record<number, number> = { 40: 72, 45: 39, 48: 24, 49: 18, 50: 21 };

const MARKETS: MarketRow[] = [
  { country: "IN", users: 892, activated: 312, usage40Plus: 186, pricing: 98, checkout: 46, paid: 24, conversionPct: 2.7 },
  { country: "US", users: 421, activated: 168, usage40Plus: 112, pricing: 64, checkout: 38, paid: 20, conversionPct: 4.8 },
  { country: "GB", users: 198, activated: 76, usage40Plus: 54, pricing: 28, checkout: 16, paid: 9, conversionPct: 4.5 },
  { country: "CA", users: 124, activated: 48, usage40Plus: 36, pricing: 18, checkout: 12, paid: 6, conversionPct: 4.8 },
  { country: "AE", users: 73, activated: 28, usage40Plus: 22, pricing: 11, checkout: 6, paid: 4, conversionPct: 5.5 },
];

const TRIGGERS: TriggerRow[] = [
  { key: "auto_apply_40", label: "Prompt at 40 apps", usersExposed: 1102, pricingClick: 144, checkout: 62, paid: 28, conversionPct: 2.5 },
  { key: "auto_apply_45", label: "Prompt at 45 apps", usersExposed: 707, pricingClick: 112, checkout: 48, paid: 22, conversionPct: 3.1 },
  { key: "auto_apply_48", label: "Prompt at 48 apps", usersExposed: 275, pricingClick: 112, checkout: 48, paid: 18, conversionPct: 6.5 },
  { key: "auto_apply_49", label: "Prompt at 49 apps", usersExposed: 163, pricingClick: 54, checkout: 26, paid: 14, conversionPct: 8.6 },
  { key: "auto_apply_50", label: "Hard paywall at 50", usersExposed: 163, pricingClick: 96, checkout: 48, paid: 28, conversionPct: 17.2 },
];

interface SeedExperiment {
  id: string;
  name: string;
  status: string;
  arms: { variant: string; label: string; isControl: boolean; users: number; converted: number }[];
}

const SEED_EXPERIMENTS: SeedExperiment[] = [
  {
    id: "free_limit",
    name: "50 Free vs 25 Free",
    status: "running",
    arms: [
      { variant: "25_free", label: "25 free applies", isControl: true, users: 624, converted: 19 },
      { variant: "50_free", label: "50 free applies", isControl: false, users: 624, converted: 26 },
    ],
  },
  {
    id: "prompt_threshold",
    name: "Prompt at 40 vs 45",
    status: "completed",
    arms: [
      { variant: "at_45", label: "Prompt at 45", isControl: true, users: 446, converted: 11 },
      { variant: "at_40", label: "Prompt at 40", isControl: false, users: 446, converted: 14 },
    ],
  },
  {
    id: "plan_recommendation",
    name: "Pro vs Premium recommendation",
    status: "running",
    arms: [
      { variant: "premium_first", label: "Premium first", isControl: true, users: 300, converted: 7 },
      { variant: "pro_first", label: "Pro first", isControl: false, users: 321, converted: 9 },
    ],
  },
  {
    id: "upgrade_copy",
    name: "Generic vs personalised copy",
    status: "completed",
    arms: [
      { variant: "generic", label: "Generic copy", isControl: true, users: 392, converted: 12 },
      { variant: "personalised", label: "Personalised value", isControl: false, users: 392, converted: 18 },
    ],
  },
];

/** Rates, lift and confidence come from the same functions the live loader uses. */
function experiments(): ExperimentView[] {
  return SEED_EXPERIMENTS.map((e) => {
    const control = e.arms.find((a) => a.isControl)!;
    const variants = e.arms.map((a) => ({
      variant: a.variant,
      label: a.label,
      isControl: a.isControl,
      users: a.users,
      conversionPct: conversionRate(a),
      liftPct: a.isControl ? null : relativeLift(control, a),
      confidencePct: a.isControl ? null : confidence(control, a),
    }));
    const best = bestVariant(variants);
    return {
      id: e.id,
      name: e.name,
      status: experimentStatusLabel(e.status),
      users: e.arms.reduce((a, b) => a + b.users, 0),
      variants,
      conversionPct: best?.conversionPct ?? null,
      liftPct: best?.liftPct ?? null,
      confidencePct: best?.confidencePct ?? null,
    };
  });
}

const COUNTRY_OPTIONS = [
  { value: "IN", label: "India" },
  { value: "US", label: "USA" },
  { value: "GB", label: "UK" },
  { value: "CA", label: "Canada" },
  { value: "AE", label: "UAE" },
];

/** Stable fake ids so the owner filter round-trips through the URL like the live one. */
const OWNER_IDS: Record<string, string> = {
  Rahul: "00000000-0000-4000-8000-000000000001",
  Sneha: "00000000-0000-4000-8000-000000000002",
  Neha: "00000000-0000-4000-8000-000000000003",
  Ankit: "00000000-0000-4000-8000-000000000004",
  Priya: "00000000-0000-4000-8000-000000000005",
};

const OWNER_OPTIONS = Object.entries(OWNER_IDS).map(([name, value]) => ({ value, label: name }));

export function mockPqlIntelligence(filters: PqlFilters, reason: string): PqlIntelligenceData {
  // Relative to real time so "12h ago" stays true tomorrow. This runs only on
  // the server, so the client receives fixed strings and cannot mismatch.
  const nowMs = Date.now();
  const { stages, biggestDropLabel } = funnel();
  const allLeads = SEED_LEADS.map((l) => mapSeedLead(l, nowMs));
  const leads = filterLeads(allLeads, filters);
  const nearLimit: NearLimitUser[] = NEAR_LIMIT_SEED.filter((u) => u.used >= filters.nearLimit).map((u) => ({
    userId: u.userId,
    name: u.name,
    autoApplyUsed: u.used,
    autoApplyLimit: 50,
    pqlScore: u.score,
    priority: u.priority,
    lastActiveAt: new Date(nowMs - u.minutesAgo * MINUTE).toISOString(),
  }));

  return {
    source: { kind: "demo", reason },
    generatedAt: new Date(nowMs - 45_000).toISOString(),
    filters,
    status: { state: "demo", label: "Demo data", detail: reason },
    usageStages: usageStageCards(),
    usersWithUsage: USERS_WITH_USAGE,
    criticalSignals: CRITICAL,
    funnel: stages,
    biggestDropLabel,
    bands: BANDS,
    totalPqls: TOTAL_PQLS,
    leads,
    leadsTotal: leads.length,
    leadReasons: leadReasons(),
    scoredUsers: SCORED_USERS,
    nearLimit: nearLimit.slice(0, 8),
    nearLimitTotal: NEAR_LIMIT_TOTALS[filters.nearLimit] ?? nearLimit.length,
    markets: filters.country ? MARKETS.filter((m) => m.country === filters.country) : MARKETS,
    triggers: TRIGGERS,
    triggerExposureBasis: "milestone_reached",
    experiments: experiments(),
    countryOptions: COUNTRY_OPTIONS,
    ownerOptions: OWNER_OPTIONS,
  };
}
