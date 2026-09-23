import { reached, type UserFacts } from "@/lib/scoring/facts";
import { HOT_PQL_MIN_SCORE } from "@/lib/scoring/pql-config";
import type { LifecycleStage } from "@/lib/scoring/lifecycle-config";

// ---------------------------------------------------------------------------
// Priority overrides (SOP 5.3) and next-best-action (SOP 5.4).
//
// The first matching trigger wins, so a user carries exactly one routing reason.
// Built-in alert rules (migration 0002) match on `priority_trigger`, so routing
// and alerting read the same decision.
// ---------------------------------------------------------------------------

export type Priority = "P0" | "P1" | "P2";

export const NEXT_BEST_ACTIONS = [
  "continue_product_nurture",
  "send_activation_reminder",
  "show_upgrade_prompt",
  "call_now",
  "send_whatsapp",
  "checkout_recovery",
  "payment_recovery",
  "route_to_product_support",
  "win_back_campaign",
  "do_nothing",
] as const;
export type NextBestAction = (typeof NEXT_BEST_ACTIONS)[number];

export const PRIORITY_TRIGGERS = [
  "payment_failed",
  "checkout_abandoned",
  "quota_exhausted",
  "pricing_high_usage",
  "near_limit",
  "repeated_failure",
  "dormant_power_user_returned",
  "new_activated",
] as const;
export type PriorityTrigger = (typeof PRIORITY_TRIGGERS)[number];

export const PRIORITY_CONFIG = {
  repeatedFailureMin7d: 3,
  newActivatedWindowDays: 7,
  /** Pricing + 40+ usage escalates from P1 to P0 at this PQL score. */
  pricingHighUsageP0Score: 90,
};

export interface PriorityResult {
  priority: Priority | null;
  trigger: PriorityTrigger | null;
  reason: string | null;
  ownerTeam: "revenue" | "sales" | "support" | "growth" | null;
  nextBestAction: NextBestAction;
}

const daysAgo = (iso: string | null, now: Date) =>
  iso === null ? Infinity : (now.getTime() - Date.parse(iso)) / 86_400_000;

export function computePriority(
  f: UserFacts,
  score: number,
  stage: LifecycleStage,
  now: Date = new Date()
): PriorityResult {
  const unpaid = !f.isPaid;

  // Revenue recovery applies to paying users too - a failed renewal is money at risk.
  if (f.paymentFailedUnresolved) {
    return {
      priority: "P0",
      trigger: "payment_failed",
      reason: "Payment failed and has not recovered",
      ownerTeam: "revenue",
      nextBestAction: "payment_recovery",
    };
  }
  if (unpaid && f.checkoutAbandoned7d) {
    return {
      priority: "P0",
      trigger: "checkout_abandoned",
      reason: "Checkout started but not paid",
      ownerTeam: "sales",
      nextBestAction: "checkout_recovery",
    };
  }
  if (unpaid && reached(f, 50) && f.autoApplyUsed >= f.usageLimit) {
    return {
      priority: "P0",
      trigger: "quota_exhausted",
      reason: `${f.autoApplyUsed}/${f.usageLimit} free Auto Applies used, not upgraded`,
      ownerTeam: "sales",
      nextBestAction: "call_now",
    };
  }
  if (unpaid && reached(f, 40) && f.pricingViews30d > 0) {
    return {
      priority: score >= PRIORITY_CONFIG.pricingHighUsageP0Score ? "P0" : "P1",
      trigger: "pricing_high_usage",
      reason: `${f.autoApplyUsed} free Auto Applies used + pricing viewed ${f.pricingViews30d}x`,
      ownerTeam: "sales",
      nextBestAction: "call_now",
    };
  }
  if (unpaid && reached(f, 45)) {
    return {
      priority: "P1",
      trigger: "near_limit",
      reason: `${f.autoApplyUsed} of ${f.usageLimit} free Auto Applies used`,
      ownerTeam: "sales",
      nextBestAction: "send_whatsapp",
    };
  }
  if (f.autoApplyFailed7d >= PRIORITY_CONFIG.repeatedFailureMin7d) {
    return {
      priority: "P1",
      trigger: "repeated_failure",
      reason: `${f.autoApplyFailed7d} Auto Apply failures in 7 days`,
      ownerTeam: "support",
      nextBestAction: "route_to_product_support",
    };
  }
  if (unpaid && f.everPowerUser && f.returnedAfterInactivity) {
    return {
      priority: "P1",
      trigger: "dormant_power_user_returned",
      reason: "Former power user returned after a dormant period",
      ownerTeam: "growth",
      nextBestAction: "win_back_campaign",
    };
  }
  if (unpaid && f.activatedAt && daysAgo(f.activatedAt, now) <= PRIORITY_CONFIG.newActivatedWindowDays) {
    return {
      priority: "P2",
      trigger: "new_activated",
      reason: "Activated in the last 7 days",
      ownerTeam: "growth",
      nextBestAction: "continue_product_nurture",
    };
  }

  let nextBestAction: NextBestAction;
  if (f.isPaid) nextBestAction = "do_nothing";
  else if (stage === "dormant") nextBestAction = "win_back_campaign";
  else if (score >= HOT_PQL_MIN_SCORE) nextBestAction = "show_upgrade_prompt";
  else if (!f.activatedAt) nextBestAction = "send_activation_reminder";
  else nextBestAction = "continue_product_nurture";

  return { priority: null, trigger: null, reason: null, ownerTeam: null, nextBestAction };
}
