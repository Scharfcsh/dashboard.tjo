import { eventDefinition } from "@/lib/events/catalog";
import type { Tone } from "@/lib/revenue-center/types";
import type { IntentStep, PqlSignal } from "@/lib/user-360/types";

// Pure helpers shared by the live loader and the demo profile (unit tested).

const FAMILY_CATEGORY: Record<string, { label: string; tone: Tone }> = {
  authentication: { label: "Authentication", tone: "slate" },
  onboarding: { label: "Onboarding", tone: "teal" },
  resume: { label: "Resume", tone: "indigo" },
  jobs: { label: "Jobs", tone: "blue" },
  manual_apply: { label: "Manual Apply", tone: "blue" },
  auto_apply: { label: "Auto Apply", tone: "teal" },
  usage_milestone: { label: "Usage", tone: "purple" },
  pricing: { label: "Monetization", tone: "amber" },
  checkout: { label: "Checkout", tone: "red" },
  payment: { label: "Payment", tone: "green" },
  subscription: { label: "Subscription", tone: "green" },
  system: { label: "Product Issue", tone: "red" },
  navigation: { label: "Navigation", tone: "slate" },
  presence: { label: "Presence", tone: "slate" },
  identity: { label: "Identity", tone: "slate" },
  sales: { label: "Sales", tone: "purple" },
  other: { label: "Activity", tone: "slate" },
};

/** Event-specific chips beat the family default (search and job views read better). */
const EVENT_CATEGORY: Record<string, { label: string; tone: Tone }> = {
  search_performed: { label: "Search", tone: "blue" },
  filter_used: { label: "Search", tone: "blue" },
  job_viewed: { label: "Job View", tone: "blue" },
  pro_clicked: { label: "Plan Selection", tone: "purple" },
  premium_clicked: { label: "Plan Selection", tone: "purple" },
  plan_compared: { label: "Plan Selection", tone: "purple" },
  preference_added: { label: "Profile", tone: "teal" },
};

export const MONETIZATION_EVENTS = new Set([
  "pricing_viewed",
  "plan_compared",
  "pro_clicked",
  "premium_clicked",
  "checkout_started",
  "checkout_abandoned",
  "payment_started",
  "payment_success",
  "payment_failed",
]);

export function eventCategory(eventName: string): { label: string; tone: Tone } {
  return EVENT_CATEGORY[eventName] ?? FAMILY_CATEGORY[eventDefinition(eventName).family] ?? FAMILY_CATEGORY.other!;
}

/** Tag shown beside a PQL reason, so a caller can read the signal at a glance. */
const SIGNAL_TAGS: Record<string, string> = {
  auto_apply_50: "High Intent",
  auto_apply_45: "High Intent",
  auto_apply_40: "Strong Signal",
  auto_apply_25: "Engaged",
  auto_apply_10: "Engaged",
  checkout_started: "Purchase Intent",
  payment_failed: "Revenue Risk",
  plan_clicked: "Strong Signal",
  pricing_viewed: "Strong Signal",
  pricing_viewed_repeat: "Strong Signal",
  sessions_3_in_7d: "Engaged",
  returned_after_inactivity: "Recent Activity",
  resume_uploaded: "Profile Complete",
  onboarding_completed: "Onboarded",
  first_auto_apply: "Activated",
  no_activity_3d: "Inactivity",
  no_activity_7d: "Inactivity",
};

export function splitSignals(reasons: { rule_id: string; label: string; points: number }[]): { positive: PqlSignal[]; negative: PqlSignal[] } {
  const positive = reasons
    .filter((r) => r.points >= 0)
    .map((r) => ({ label: r.label, points: r.points, tag: SIGNAL_TAGS[r.rule_id] ?? null }))
    .sort((a, b) => b.points - a.points);
  const negative = reasons
    .filter((r) => r.points < 0)
    .map((r) => ({ label: r.label, points: r.points, tag: SIGNAL_TAGS[r.rule_id] ?? null }));
  return { positive, negative };
}

/** "No major inactivity" style reassurances when nothing is dragging the score down. */
export function reassurances(hasInactivity: boolean, hasPaymentFailure: boolean): PqlSignal[] {
  const out: PqlSignal[] = [];
  if (!hasInactivity) out.push({ label: "No major inactivity", points: 0, tag: "Neutral" });
  if (!hasPaymentFailure) out.push({ label: "No unresolved payment failure", points: 0, tag: "Neutral" });
  return out;
}

export function intentJourney(input: {
  pricingViews: number;
  proClicks: number;
  premiumClicks: number;
  checkoutsStarted: number;
  checkoutsAbandoned: number;
  paymentAttempts: number;
}): IntentStep[] {
  return [
    { key: "pricing", label: "Pricing Views", value: input.pricingViews, tone: "blue", emphasis: false },
    { key: "pro", label: "Pro Clicked", value: input.proClicks, tone: "teal", emphasis: false },
    { key: "premium", label: "Premium Clicked", value: input.premiumClicks, tone: "purple", emphasis: false },
    { key: "checkout", label: "Checkout Starts", value: input.checkoutsStarted, tone: "amber", emphasis: false },
    { key: "abandoned", label: "Checkout Abandonment", value: input.checkoutsAbandoned, tone: "red", emphasis: input.checkoutsAbandoned > 0 },
    { key: "payments", label: "Payment Attempts", value: input.paymentAttempts, tone: "green", emphasis: false },
  ];
}

export const recommendedPlan = (lastPlanClicked: string | null, isPaid: boolean, plan: string) =>
  isPaid ? plan : lastPlanClicked === "premium_clicked" ? "Premium" : "Pro";

/** Relative change in percent, or null when there is no previous-period basis. */
export const trendPct = (current: number, previous: number) =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

export function slaRemaining(slaDueAt: string | null, nowMs: number): { text: string; overdue: boolean } | null {
  if (!slaDueAt) return null;
  const diffMin = Math.round((Date.parse(slaDueAt) - nowMs) / 60_000);
  if (diffMin < 0) {
    const late = Math.abs(diffMin);
    const text = late < 60 ? `${late} min overdue` : late < 1440 ? `${Math.round(late / 60)}h overdue` : `${Math.round(late / 1440)}d overdue`;
    return { text, overdue: true };
  }
  if (diffMin < 60) return { text: `${diffMin} minutes`, overdue: false };
  const hours = Math.floor(diffMin / 60);
  return { text: hours < 24 ? `${hours}h ${diffMin % 60}m` : `${Math.round(hours / 24)}d`, overdue: false };
}
