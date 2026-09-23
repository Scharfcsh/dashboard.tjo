// ---------------------------------------------------------------------------
// Event catalogue - the single place that says what an event *means*.
//
// Sources: SOP Appendix A + section 4.3, and what betterapply actually emits
// (betterapply/TRACKING.md). Every job and endpoint that needs to know whether an
// event is important, user-initiated, or trustworthy only from a server reads it
// from here - never from its own list.
//
//   importance   drives the live "Important Events" stream (low is hidden by default)
//   meaningful   counts toward "active" (a user-initiated product action).
//                Worker outcomes, webhooks and identity syncs are NOT activity.
//   serverOnly   rejected from keyless (browser) ingestion - these move revenue,
//                usage and identity numbers, so a browser must not be able to forge them.
//   feature      product area, for feature adoption and "features used right now"
// ---------------------------------------------------------------------------

export type Importance = "high" | "medium" | "low";

export type Feature =
  | "onboarding"
  | "job_search"
  | "job_feed"
  | "manual_apply"
  | "auto_apply"
  | "resume"
  | "pricing"
  | "checkout"
  | "profile";

export interface EventDefinition {
  family: string;
  label: string;
  importance: Importance;
  meaningful: boolean;
  serverOnly: boolean;
  feature?: Feature;
}

const def = (
  family: string,
  label: string,
  importance: Importance,
  opts: { meaningful?: boolean; serverOnly?: boolean; feature?: Feature } = {}
): EventDefinition => ({
  family,
  label,
  importance,
  meaningful: opts.meaningful ?? true,
  serverOnly: opts.serverOnly ?? false,
  feature: opts.feature,
});

export const EVENT_CATALOG: Record<string, EventDefinition> = {
  // Authentication / identity
  signup_started: def("authentication", "Started signup", "low", { feature: "onboarding" }),
  signup_completed: def("authentication", "Completed signup", "high", { feature: "onboarding" }),
  login: def("authentication", "Logged in", "low"),
  logout: def("authentication", "Logged out", "low", { meaningful: false }),
  user_identified: def("identity", "Identity updated", "low", { meaningful: false, serverOnly: true }),
  user_updated: def("identity", "Profile traits updated", "low", { meaningful: false, serverOnly: true }),

  // Onboarding
  onboarding_started: def("onboarding", "Started onboarding", "low", { feature: "onboarding" }),
  onboarding_step_completed: def("onboarding", "Completed onboarding step", "low", { feature: "onboarding" }),
  onboarding_completed: def("onboarding", "Completed onboarding", "medium", { feature: "onboarding" }),
  preference_added: def("onboarding", "Added job preference", "low", { feature: "profile" }),

  // Resume
  resume_uploaded: def("resume", "Uploaded resume", "medium", { feature: "resume" }),
  resume_parsed: def("resume", "Resume parsed", "low", { meaningful: false, feature: "resume" }),
  resume_analyzed: def("resume", "Resume analyzed", "low", { feature: "resume" }),
  resume_updated: def("resume", "Updated resume", "low", { feature: "resume" }),
  resume_tailored: def("resume", "Tailored resume", "medium", { feature: "resume" }),

  // Jobs
  search_performed: def("jobs", "Searched jobs", "low", { feature: "job_search" }),
  filter_used: def("jobs", "Used job filter", "low", { feature: "job_search" }),
  job_viewed: def("jobs", "Viewed job", "low", { feature: "job_feed" }),
  job_saved: def("jobs", "Saved job", "low", { feature: "job_feed" }),
  job_unsaved: def("jobs", "Unsaved job", "low", { feature: "job_feed" }),

  // Manual apply
  apply_clicked: def("manual_apply", "Clicked apply", "low", { feature: "manual_apply" }),
  apply_started: def("manual_apply", "Started manual apply", "low", { feature: "manual_apply" }),
  apply_completed: def("manual_apply", "Completed manual apply", "medium", { feature: "manual_apply" }),
  apply_failed: def("manual_apply", "Manual apply failed", "medium", { meaningful: false, feature: "manual_apply" }),

  // AI Auto Apply. `started` is the user's click (server-instrumented); the
  // outcomes arrive later from the worker, so they are not user activity.
  auto_apply_started: def("auto_apply", "Started Auto Apply", "medium", { serverOnly: true, feature: "auto_apply" }),
  auto_apply_success: def("auto_apply", "Auto Apply submitted", "medium", {
    meaningful: false,
    serverOnly: true,
    feature: "auto_apply",
  }),
  auto_apply_failed: def("auto_apply", "Auto Apply failed", "high", {
    meaningful: false,
    serverOnly: true,
    feature: "auto_apply",
  }),
  auto_apply_blocked: def("auto_apply", "Auto Apply blocked by limit", "high", {
    meaningful: false,
    serverOnly: true,
    feature: "auto_apply",
  }),
  // betterapply emits one event with { milestone, used }; the SOP names them per threshold.
  auto_apply_milestone: def("usage_milestone", "Reached Auto Apply milestone", "high", {
    meaningful: false,
    serverOnly: true,
    feature: "auto_apply",
  }),

  // Pricing / checkout / payment / subscription
  pricing_viewed: def("pricing", "Viewed pricing", "medium", { feature: "pricing" }),
  plan_compared: def("pricing", "Compared plans", "medium", { feature: "pricing" }),
  pro_clicked: def("pricing", "Clicked Pro plan", "high", { feature: "pricing" }),
  premium_clicked: def("pricing", "Clicked Premium plan", "high", { feature: "pricing" }),
  upgrade_prompt_shown: def("pricing", "Saw upgrade prompt", "low", { meaningful: false, feature: "pricing" }),
  // Sent by BOTH the browser and the server (betterapply). Not serverOnly for that
  // reason; metrics de-duplicate - see lib/jobs/rollup.ts.
  checkout_started: def("checkout", "Started checkout", "high", { feature: "checkout" }),
  checkout_abandoned: def("checkout", "Abandoned checkout", "high", { meaningful: false, serverOnly: true }),
  payment_started: def("payment", "Started payment", "medium", { serverOnly: true, feature: "checkout" }),
  payment_success: def("payment", "Payment succeeded", "high", { meaningful: false, serverOnly: true }),
  payment_failed: def("payment", "Payment failed", "high", { meaningful: false, serverOnly: true }),
  subscription_started: def("subscription", "Subscription started", "high", { meaningful: false, serverOnly: true }),
  subscription_renewed: def("subscription", "Subscription renewed", "medium", { meaningful: false, serverOnly: true }),
  subscription_cancelled: def("subscription", "Subscription cancelled", "high", { meaningful: false, serverOnly: true }),
  subscription_expired: def("subscription", "Subscription expired", "high", { meaningful: false, serverOnly: true }),

  // Experiments. Server-only: a browser must not be able to choose its own
  // bucket, or the results are worthless. Carries { experiment_id, variant }.
  experiment_assigned: def("experiment", "Assigned to an experiment", "low", {
    meaningful: false,
    serverOnly: true,
  }),

  // Sales (if the main app ever emits them)
  lead_created: def("sales", "Lead created", "medium", { meaningful: false, serverOnly: true }),
  lead_assigned: def("sales", "Lead assigned", "low", { meaningful: false, serverOnly: true }),
  lead_converted: def("sales", "Lead converted", "high", { meaningful: false, serverOnly: true }),

  // System / product health
  error_shown: def("system", "Saw an error", "medium", { meaningful: false }),
  otp_required: def("system", "OTP required", "low", { meaningful: false }),
  resume_parse_failed: def("system", "Resume parse failed", "medium", { meaningful: false, feature: "resume" }),
  apply_queue_stuck: def("system", "Apply queue stuck", "high", { meaningful: false, serverOnly: true }),

  // Noise
  heartbeat: def("presence", "Heartbeat", "low", { meaningful: false }),
  page_view: def("navigation", "Viewed page", "low", { meaningful: false }),
};

const UNKNOWN: EventDefinition = {
  family: "other",
  label: "",
  importance: "low",
  meaningful: true,
  serverOnly: false,
};

export function eventDefinition(name: string): EventDefinition {
  return EVENT_CATALOG[name] ?? { ...UNKNOWN, label: name.replace(/_/g, " ") };
}

export const isServerOnly = (name: string) => eventDefinition(name).serverOnly;

const IMPORTANCE_RANK: Record<Importance, number> = { low: 0, medium: 1, high: 2 };

/** Event names at or above an importance level (known events only). */
export function eventNamesAtLeast(level: Importance): string[] {
  return Object.entries(EVENT_CATALOG)
    .filter(([, d]) => IMPORTANCE_RANK[d.importance] >= IMPORTANCE_RANK[level])
    .map(([name]) => name);
}

/**
 * Names that are NOT meaningful. SQL uses `event_name <> ALL($notMeaningful)` so
 * unknown (new) events count as activity by default.
 */
export const NOT_MEANINGFUL_EVENTS: string[] = Object.entries(EVENT_CATALOG)
  .filter(([, d]) => !d.meaningful)
  .map(([name]) => name);

export function eventsForFeature(feature: Feature): string[] {
  return Object.entries(EVENT_CATALOG)
    .filter(([, d]) => d.feature === feature)
    .map(([name]) => name);
}

export const FEATURES: Feature[] = [
  "onboarding",
  "job_search",
  "job_feed",
  "manual_apply",
  "auto_apply",
  "resume",
  "pricing",
  "checkout",
  "profile",
];

/** Free-plan Auto Apply allowance (betterapply lib/plan-catalog.ts). */
export const FREE_AUTO_APPLY_LIMIT = 50;

/** Usage thresholds (SOP App. A lists 48; betterapply emits 10/25/40/45/49/50). */
export const AUTO_APPLY_THRESHOLDS = [10, 25, 40, 45, 48, 49, 50] as const;
