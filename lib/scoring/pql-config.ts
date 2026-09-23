import { reached, type UserFacts } from "@/lib/scoring/facts";

// ---------------------------------------------------------------------------
// PQL scoring model - SOP section 5.2 "Default PQL scoring model", as data.
//
// Change a weight here, bump PQL_RULES_VERSION, and the next scoring run
// rewrites every score with history rows that name the new version. Nothing
// else in the codebase knows a point value.
//
// Interpretation notes (SOP gives behaviours, not windows):
//   * Intent signals (pricing, plan click, checkout) count within the last 30 days.
//   * "No activity 3 days" and "No activity 7 days" are exclusive tiers
//     (-10 from day 3, replaced by -20 from day 7), not cumulative.
//   * Usage milestones are sticky: once reached they keep scoring even if the
//     live count drops after a failed run refunds a slot.
// ---------------------------------------------------------------------------

export const PQL_RULES_VERSION = "pql-v1";

export interface PqlRule {
  id: string;
  label: string;
  points: number;
  when: (f: UserFacts) => boolean;
}

export const PQL_RULES: PqlRule[] = [
  { id: "resume_uploaded", label: "Resume uploaded", points: 5, when: (f) => !!f.resumeUploadedAt },
  { id: "onboarding_completed", label: "Onboarding completed", points: 5, when: (f) => !!f.onboardedAt },
  { id: "first_auto_apply", label: "First Auto Apply", points: 5, when: (f) => !!f.firstAutoApplyAt },
  { id: "auto_apply_10", label: "10 free applies used", points: 5, when: (f) => reached(f, 10) },
  { id: "auto_apply_25", label: "25 free applies used", points: 5, when: (f) => reached(f, 25) },
  { id: "auto_apply_40", label: "40 free applies used", points: 10, when: (f) => reached(f, 40) },
  { id: "auto_apply_45", label: "45 free applies used", points: 10, when: (f) => reached(f, 45) },
  { id: "auto_apply_50", label: "50/50 free applies used", points: 20, when: (f) => reached(f, 50) },
  { id: "pricing_viewed", label: "Pricing viewed", points: 8, when: (f) => f.pricingViews30d >= 1 },
  { id: "pricing_viewed_repeat", label: "Pricing viewed 2+ times", points: 8, when: (f) => f.pricingViews30d >= 2 },
  { id: "plan_clicked", label: "Plan clicked", points: 12, when: (f) => f.planClicks30d >= 1 },
  { id: "checkout_started", label: "Checkout started", points: 20, when: (f) => f.checkoutStarted30d >= 1 },
  { id: "payment_failed", label: "Payment failed", points: 25, when: (f) => f.paymentFailedUnresolved },
  { id: "sessions_3_in_7d", label: "3+ sessions in 7 days", points: 5, when: (f) => f.sessions7d >= 3 },
  {
    id: "returned_after_inactivity",
    label: "Returned after inactivity",
    points: 5,
    when: (f) => f.returnedAfterInactivity,
  },
  {
    id: "no_activity_3d",
    label: "No activity 3 days",
    points: -10,
    when: (f) => f.daysSinceActive !== null && f.daysSinceActive >= 3 && f.daysSinceActive < 7,
  },
  {
    id: "no_activity_7d",
    label: "No activity 7 days",
    points: -20,
    when: (f) => f.daysSinceActive !== null && f.daysSinceActive >= 7,
  },
];

/**
 * The rules that indicate *purchase* intent rather than activation. Dashboard 4's
 * "Why Users Are Becoming PQLs" breakdown shows these; the activation rules
 * (resume uploaded, onboarding, first/10/25 applies) fire for nearly every
 * active user and would drown out the signals a revenue team can act on.
 */
export const MONETIZATION_SIGNAL_RULES = new Set([
  "auto_apply_40",
  "auto_apply_45",
  "auto_apply_50",
  "pricing_viewed",
  "pricing_viewed_repeat",
  "plan_clicked",
  "checkout_started",
  "payment_failed",
  "sessions_3_in_7d",
  "returned_after_inactivity",
]);

export type PqlCategory = "buy_now" | "hot" | "warm" | "engaged" | "early";

/** Bands from the approved Dashboard 4 reference. "Hot PQL" means score >= HOT_PQL_MIN_SCORE. */
export const PQL_CATEGORIES: { category: PqlCategory; label: string; min: number }[] = [
  { category: "buy_now", label: "Buy Now", min: 90 },
  { category: "hot", label: "Hot", min: 75 },
  { category: "warm", label: "Warm", min: 60 },
  { category: "engaged", label: "Engaged", min: 40 },
  { category: "early", label: "Early", min: 0 },
];

export const HOT_PQL_MIN_SCORE = 75;
