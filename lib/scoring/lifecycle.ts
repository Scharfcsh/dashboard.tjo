import type { UserFacts } from "@/lib/scoring/facts";
import { LIFECYCLE_CONFIG as C, type LifecycleStage } from "@/lib/scoring/lifecycle-config";

// ---------------------------------------------------------------------------
// Lifecycle stage - first matching rule wins:
//
//   paid         active subscription
//   dormant      previously active, no meaningful activity for 7+ days
//   pql          PQL score >= 75 (strong purchase readiness beats the usage stages)
//   resurrected  back within 7 days after a dormant-length gap
//   power_user   5+ active days in 7 and 10+ Auto Apply runs in 7 days
//   engaged      3+ active days in 7
//   activated    resume + job interaction + first successful Auto Apply
//   onboarded    signup/onboarding completed
//   new          everyone else
// ---------------------------------------------------------------------------

export interface LifecycleResult {
  stage: LifecycleStage;
  reason: string;
}

export function computeLifecycle(f: UserFacts, pqlScore: number): LifecycleResult {
  if (f.isPaid) return { stage: "paid", reason: "Active subscription" };
  if (f.lastActiveAt && f.daysSinceActive !== null && f.daysSinceActive >= C.dormantAfterDays) {
    return { stage: "dormant", reason: `No meaningful activity for ${f.daysSinceActive} days` };
  }
  if (pqlScore >= C.pqlMinScore) return { stage: "pql", reason: `PQL score ${pqlScore} >= ${C.pqlMinScore}` };
  if (f.returnedAfterInactivity) {
    return { stage: "resurrected", reason: `Returned after ${C.dormantAfterDays}+ inactive days` };
  }
  if (f.activeDays7d >= C.powerUserActiveDays7d && f.autoApplyStarted7d >= C.powerUserAutoApplies7d) {
    return {
      stage: "power_user",
      reason: `${f.activeDays7d} active days and ${f.autoApplyStarted7d} Auto Apply runs in 7 days`,
    };
  }
  if (f.activeDays7d >= C.engagedActiveDays7d) {
    return { stage: "engaged", reason: `${f.activeDays7d} active days in 7 days` };
  }
  if (f.activatedAt) return { stage: "activated", reason: "Resume, job interaction and first successful Auto Apply" };
  if (f.onboardedAt) return { stage: "onboarded", reason: "Completed onboarding" };
  return { stage: "new", reason: "Signed up; activation not yet reached" };
}
