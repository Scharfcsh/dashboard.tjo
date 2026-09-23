// ---------------------------------------------------------------------------
// Lifecycle thresholds - SOP 5.1 gives "suggested definitions"; these are the
// concrete numbers. Phase 0 of the SOP expects the business to freeze them, so
// they live here as config, and every change should bump LIFECYCLE_RULES_VERSION.
// ---------------------------------------------------------------------------

export const LIFECYCLE_RULES_VERSION = "lifecycle-v1";

export const LIFECYCLE_STAGES = [
  "new",
  "onboarded",
  "activated",
  "engaged",
  "power_user",
  "pql",
  "dormant",
  "resurrected",
  "paid",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_CONFIG = {
  /** No meaningful activity for this many days => dormant. */
  dormantAfterDays: 7,
  /** A dormant user active again stays "resurrected" for this many days. */
  resurrectedWindowDays: 7,
  /** Active days in the last 7 for engaged / power user. */
  engagedActiveDays7d: 3,
  powerUserActiveDays7d: 5,
  /** Auto Apply runs started in the last 7 days for power user. */
  powerUserAutoApplies7d: 10,
  /** PQL stage threshold - same number as "Hot PQL". */
  pqlMinScore: 75,
};
