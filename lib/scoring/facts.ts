// The per-user inputs every scoring function reads. Built by lib/jobs/facts.ts
// from derived tables only; the scoring functions themselves are pure.

export interface UserFacts {
  userId: string;
  isPaid: boolean;

  signupAt: string | null;
  onboardedAt: string | null;
  resumeUploadedAt: string | null;
  firstAutoApplyAt: string | null;
  firstAutoApplySuccessAt: string | null;
  activatedAt: string | null;

  autoApplyUsed: number;
  usageLimit: number;
  /** Auto Apply thresholds ever reached (sticky, from user_milestones). */
  thresholdsReached: number[];
  autoApplyStarted7d: number;
  autoApplyFailed7d: number;

  pricingViews30d: number;
  planClicks30d: number;
  checkoutStarted30d: number;
  /** A failed charge in the last 30 days with no later success. */
  paymentFailedUnresolved: boolean;
  /** A derived checkout_abandoned in the last 7 days with no later payment. */
  checkoutAbandoned7d: boolean;

  sessions7d: number;
  activeDays7d: number;
  lastActiveAt: string | null;
  daysSinceActive: number | null;
  /** Active in the last 7 days after a gap of at least the dormancy window. */
  returnedAfterInactivity: boolean;

  previousStage: string | null;
  everPowerUser: boolean;
}

export const reached = (f: UserFacts, threshold: number) =>
  f.thresholdsReached.some((t) => t >= threshold) || f.autoApplyUsed >= threshold;
