import "server-only";
import { countryName } from "@/lib/revenue-center/format";
import { findMockLiveUser, mockLiveSession } from "@/lib/live-intelligence/mock";
import { eventCategory, intentJourney, MONETIZATION_EVENTS, recommendedPlan } from "@/lib/user-360/derive";
import type {
  ApplicationRow,
  DirectoryData,
  DirectoryRow,
  ProfileMetric,
  SessionCard,
  UserProfileData,
} from "@/lib/user-360/types";

// ---------------------------------------------------------------------------
// Demo User 360 profile, used when the analytics database is unavailable.
// TJO-14882 (Vishal Sharma) reproduces the approved reference screen exactly;
// every other demo user is derived from the Live User Intelligence dataset.
// ---------------------------------------------------------------------------

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const metric = (
  key: string,
  label: string,
  value: string,
  icon: ProfileMetric["icon"],
  tone: ProfileMetric["tone"],
  trendPct: number | null,
  secondary: string | null,
  definition: string,
  bar: ProfileMetric["bar"] = null
): ProfileMetric => ({ key, label, value, icon, tone, trendPct, secondary, bar, definition });

const COMPANIES: [string, string, string][] = [
  ["Amazon", "SDE II", "submitted"],
  ["Razorpay", "Senior Frontend Engineer", "submitted"],
  ["Swiggy", "Backend Engineer", "submitted"],
  ["Flipkart", "Software Engineer II", "failed"],
  ["Zomato", "Full Stack Engineer", "submitted"],
  ["PhonePe", "Backend Developer", "submitted"],
  ["Meesho", "Software Engineer", "failed"],
  ["CRED", "Product Engineer", "submitted"],
  ["Zerodha", "Platform Engineer", "submitted"],
  ["Groww", "Software Engineer", "manual"],
];

function mockApplications(now: number, count: number): ApplicationRow[] {
  return COMPANIES.slice(0, count).map(([company, title, outcome], i) => ({
    id: `mock-app-${i}`,
    company,
    title,
    jobUrl: `https://jobs.example.com/${company.toLowerCase()}/${1000 + i}`,
    startedAt: new Date(now - (i + 1) * 47 * MIN).toISOString(),
    finishedAt: outcome === "manual" ? null : new Date(now - (i + 1) * 47 * MIN + 90_000).toISOString(),
    outcome: outcome as ApplicationRow["outcome"],
    reason: outcome === "failed" ? "Employer form required a question only the applicant can answer" : null,
    platform: outcome === "manual" ? "Manual apply" : "Workday",
  }));
}

const REFERENCE_SESSION_1: [number, string, string][] = [
  // minutes into the session, event name, label
  [0, "login", "Login"],
  [1, "page_view", "Opened Job Feed"],
  [2, "search_performed", 'Searched "Software Engineer"'],
  [4, "job_viewed", "Viewed Amazon job"],
  [5, "auto_apply_success", "Auto Apply #45"],
  [7, "auto_apply_success", "Auto Apply #46"],
  [9, "auto_apply_success", "Auto Apply #47"],
  [11, "pricing_viewed", "Opened Pricing"],
  [12, "pro_clicked", "Clicked Pro Plan"],
  [13, "checkout_started", "Opened Checkout"],
  [14, "checkout_abandoned", "Closed Checkout"],
  [16, "page_view", "Returned to Job Feed"],
];

const REFERENCE_SESSION_2: [number, string, string][] = [
  [0, "resume_analyzed", "Resume Analyzer"],
  [3, "resume_updated", "Updated Resume"],
  [7, "job_viewed", "Viewed 17 jobs"],
  [14, "auto_apply_success", "Completed 8 Auto Applies"],
  [22, "pricing_viewed", "Viewed Pricing"],
];

function buildSession(id: string, startMs: number, durationSeconds: number, steps: [number, string, string][], device: string, isCurrent: boolean): SessionCard {
  return {
    sessionId: id,
    startedAt: new Date(startMs).toISOString(),
    endedAt: isCurrent ? null : new Date(startMs + durationSeconds * 1000).toISOString(),
    durationSeconds,
    device,
    isCurrent,
    eventCount: steps.length,
    events: steps.map(([minute, eventName, label], i) => {
      const category = eventCategory(eventName);
      return {
        id: `${id}-e${i}`,
        at: new Date(startMs + minute * MIN).toISOString(),
        label,
        category: category.label,
        tone: category.tone,
        outcome: eventName === "auto_apply_success" ? ("success" as const) : null,
        monetization: MONETIZATION_EVENTS.has(eventName),
      };
    }),
  };
}

function referenceProfile(now: number): UserProfileData {
  const session1Start = now - 16 * MIN;
  const session2Start = now - DAY - 30 * MIN;
  const successRate = 87;

  return {
    source: { kind: "demo", reason: "" },
    generatedAt: new Date(now).toISOString(),
    user: {
      userId: "TJO-14882",
      displayId: "TJO-14882",
      name: "Vishal Sharma",
      email: "vishal******@gmail.com",
      phone: "+91 ******8210",
      country: "IN",
      city: "Bengaluru",
      plan: "FREE",
      isPaid: false,
      isOnline: true,
      lastActiveAt: new Date(now - 30_000).toISOString(),
      signupAt: new Date(Date.UTC(2026, 7, 22, 6, 30)).toISOString(),
      targetRole: "Software Engineer",
      experience: "4 Years",
      lifecycleStage: "power_user",
      pqlScore: 96,
      pqlCategory: "buy_now",
      priority: "P0",
      priorityReason: "47/50 free Auto Applies used + pricing opened 4 times + Pro plan selected yesterday.",
      nextBestAction: "call_now",
      firstTouch: "Instagram",
      campaign: "Bangalore_Reel_07",
    },
    metrics: [
      metric("sessions", "Sessions", "17", "activity", "blue", 13, "vs last 30 days", "Browser sessions (30 idle minutes ends one)."),
      metric("active_days", "Active Days", "9", "calendar", "purple", 50, "of last 30 days", "Days with at least one meaningful action."),
      metric("jobs_viewed", "Jobs Viewed", "183", "eye", "teal", 24, null, "job_viewed events, all time."),
      metric("jobs_saved", "Saved Jobs", "26", "file", "amber", 18, null, "job_saved events, all time."),
      metric("apply_clicks", "Apply Clicks", "61", "target", "blue", 37, null, "Manual apply clicks."),
      metric("auto_applies", "Auto Applies", "47/50", "zap", "teal", null, "94% used", "Free Auto Apply allowance consumed.", { used: 47, limit: 50 }),
      metric("successful", "Successful", "41", "user-check", "green", null, `${successRate}% success rate`, "Auto Apply runs that submitted."),
      metric("failed", "Failed", "6", "x-circle", "red", null, "13% failure rate", "Auto Apply runs that failed."),
    ],
    usage: [
      { label: "Resume uploaded", value: "Yes", icon: "file", progress: null, state: "yes" },
      { label: "Resume score", value: "88/100", icon: "gauge", progress: 88, state: "neutral" },
      { label: "Job profile created", value: "Yes", icon: "user-check", progress: null, state: "yes" },
      { label: "Target role", value: "Software Engineer", icon: "target", progress: null, state: "neutral" },
      { label: "Preferred locations", value: "Bengaluru, Hyderabad, Remote", icon: "users", progress: null, state: "neutral" },
      { label: "Matched jobs viewed", value: "183", icon: "eye", progress: null, state: "neutral" },
      { label: "AI resume tailoring uses", value: "9", icon: "sparkles", progress: null, state: "neutral" },
      { label: "Cover letters generated", value: "4", icon: "file", progress: null, state: "neutral" },
      { label: "Auto Apply", value: "47/50", icon: "zap", progress: 94, state: "neutral" },
      { label: "Application success rate", value: "87%", icon: "target", progress: successRate, state: "neutral" },
    ],
    acquisition: [
      { label: "First Touch", value: "Instagram", icon: "sparkles" },
      { label: "Campaign", value: "Bangalore Reel 07", icon: "flame" },
      { label: "Landing Page", value: "/ai-auto-apply", icon: "eye", mono: true },
      { label: "UTM Source", value: "instagram", icon: "tag", mono: true },
      { label: "UTM Medium", value: "organic", icon: "tag", mono: true },
      { label: "UTM Campaign", value: "bangalore_reel_07", icon: "tag", mono: true },
      { label: "Signup Device", value: "Android", icon: "users" },
      { label: "Current Device", value: "Windows Chrome", icon: "users" },
    ],
    health: {
      status: "Healthy",
      items: [
        { label: "6 Auto Apply failures (lifetime)", severity: "warn" },
        { label: "2 failures in last 7 days", severity: "warn" },
        { label: "No payment failures", severity: "ok" },
        { label: "No support tickets", severity: "ok" },
        { label: "No account blocks", severity: "ok" },
      ],
    },
    sessions: [
      buildSession("mock-s1", session1Start, 14 * 60 + 21, REFERENCE_SESSION_1, "Windows Chrome", true),
      buildSession("mock-s2", session2Start, 22 * 60 + 9, REFERENCE_SESSION_2, "Android Chrome", false),
    ],
    intent: {
      steps: intentJourney({ pricingViews: 4, proClicks: 2, premiumClicks: 1, checkoutsStarted: 1, checkoutsAbandoned: 1, paymentAttempts: 0 }),
      recommendedPlan: "Pro",
      firstPricingViewAt: new Date(Date.UTC(2026, 7, 28, 12, 0)).toISOString(),
      lastPricingViewDate: new Date(now - 16 * MIN + 11 * MIN).toISOString().slice(0, 10),
      subscriptions: [],
      payments: { successful: 0, failed: 0, lifetimeRevenue: 0, lastSuccessAt: null, lastFailureAt: null },
    },
    pqlSignals: {
      positive: [
        { label: "Reached 45+ Auto Applies", points: 20, tag: "High Intent" },
        { label: "Checkout started", points: 20, tag: "Purchase Intent" },
        { label: "Repeated pricing visits (4 times)", points: 16, tag: "Strong Signal" },
        { label: "Pro plan clicked", points: 12, tag: "Strong Signal" },
        { label: "High session frequency", points: 10, tag: "Engaged" },
        { label: "Active today", points: 8, tag: "Recent Activity" },
        { label: "Resume uploaded", points: 5, tag: "Profile Complete" },
        { label: "Onboarding completed", points: 5, tag: "Onboarded" },
      ],
      negative: [
        { label: "No major inactivity", points: 0, tag: "Neutral" },
        { label: "No unresolved payment failure", points: 0, tag: "Neutral" },
      ],
    },
    sales: {
      leadId: "mock-lead-14882",
      ownerId: "mock-rahul",
      ownerName: "Rahul",
      status: "Uncontacted",
      leadCreatedAt: new Date(now - 7 * MIN).toISOString(),
      slaDueAt: new Date(now + 8 * MIN).toISOString(),
      lastContactAt: null,
      counts: { call: 0, whatsapp: 0, email: 0, note: 0 },
      pendingCallbacks: [],
    },
    salesActivities: [],
    applications: mockApplications(now, 10),
    support: {
      status: "Healthy",
      autoApplyFailuresLifetime: 6,
      autoApplyFailures7d: 2,
      paymentFailures: 0,
      errors7d: 0,
      blocked: 0,
      openAlerts: [],
      ticketsConnected: false,
    },
    rawEvents: { rows: [], nextCursor: null },
    team: [
      { value: "mock-rahul", label: "Rahul Kumar" },
      { value: "mock-sneha", label: "Sneha Patel" },
      { value: "mock-amit", label: "Amit Singh" },
    ],
  };
}

/** Demo profile for any user in the Live User Intelligence dataset. */
function derivedProfile(userId: string, now: number): UserProfileData | null {
  const u = findMockLiveUser(userId, now);
  if (!u) return null;
  const base = referenceProfile(now);
  const session = mockLiveSession(userId, now);
  const successful = Math.max(0, u.autoAppliesUsed - u.autoApplyFailures7d);
  const rate = u.autoAppliesUsed === 0 ? null : Math.round((successful / u.autoAppliesUsed) * 100);
  const sessions = Math.max(1, Math.round(u.pqlScore / 6));
  const jobsViewed = u.autoAppliesUsed * 4 + 11;

  return {
    ...base,
    user: {
      userId: u.userId,
      displayId: u.displayId,
      name: u.name,
      email: u.email,
      phone: u.phone,
      country: u.country,
      city: null,
      plan: u.plan,
      isPaid: u.isPaid,
      isOnline: u.isOnline,
      lastActiveAt: u.lastSeenAt,
      signupAt: u.signupAt,
      targetRole: "Software Engineer",
      experience: "3 Years",
      lifecycleStage: u.lifecycleStage,
      pqlScore: u.pqlScore,
      pqlCategory: u.pqlScore >= 90 ? "buy_now" : u.pqlScore >= 75 ? "hot" : u.pqlScore >= 60 ? "warm" : "engaged",
      priority: u.priority,
      priorityReason: u.priority ? `${u.autoAppliesUsed}/${u.autoApplyLimit} free Auto Applies used · ${u.pricingViews30d} pricing views` : null,
      nextBestAction: u.nextBestAction,
      firstTouch: u.source ? u.source[0]!.toUpperCase() + u.source.slice(1) : null,
      campaign: null,
    },
    metrics: [
      metric("sessions", "Sessions", String(sessions), "activity", "blue", 8, "vs last 30 days", base.metrics[0]!.definition),
      metric("active_days", "Active Days", String(Math.max(1, Math.round(sessions / 2))), "calendar", "purple", 12, "of last 30 days", base.metrics[1]!.definition),
      metric("jobs_viewed", "Jobs Viewed", String(jobsViewed), "eye", "teal", 15, null, base.metrics[2]!.definition),
      metric("jobs_saved", "Saved Jobs", String(Math.round(jobsViewed / 7)), "file", "amber", 6, null, base.metrics[3]!.definition),
      metric("apply_clicks", "Apply Clicks", String(Math.round(u.autoAppliesUsed * 1.3)), "target", "blue", 9, null, base.metrics[4]!.definition),
      metric("auto_applies", "Auto Applies", `${u.autoAppliesUsed}/${u.autoApplyLimit}`, "zap", "teal", null, `${Math.round((u.autoAppliesUsed / u.autoApplyLimit) * 100)}% used`, base.metrics[5]!.definition, { used: u.autoAppliesUsed, limit: u.autoApplyLimit }),
      metric("successful", "Successful", String(successful), "user-check", "green", null, rate === null ? null : `${rate}% success rate`, base.metrics[6]!.definition),
      metric("failed", "Failed", String(u.autoApplyFailures7d), "x-circle", "red", null, rate === null ? null : `${100 - rate}% failure rate`, base.metrics[7]!.definition),
    ],
    usage: base.usage.map((item) =>
      item.label === "Auto Apply"
        ? { ...item, value: `${u.autoAppliesUsed}/${u.autoApplyLimit}`, progress: Math.round((u.autoAppliesUsed / u.autoApplyLimit) * 100) }
        : item.label === "Application success rate"
          ? { ...item, value: rate === null ? "—" : `${rate}%`, progress: rate }
          : item.label === "Matched jobs viewed"
            ? { ...item, value: String(jobsViewed) }
            : item
    ),
    acquisition: base.acquisition.map((a) =>
      a.label === "First Touch"
        ? { ...a, value: u.source ? u.source[0]!.toUpperCase() + u.source.slice(1) : "Unknown" }
        : a.label === "Campaign"
          ? { ...a, value: null }
          : a.label === "UTM Source"
            ? { ...a, value: u.source }
            : a
    ),
    sessions: session
      ? [
          {
            sessionId: session.sessionId,
            startedAt: session.startedAt,
            endedAt: session.isOnline ? null : session.events[session.events.length - 1]?.at ?? null,
            durationSeconds: Math.max(60, Math.round((Date.parse(u.lastSeenAt ?? session.startedAt) - Date.parse(session.startedAt)) / 1000)),
            device: session.browser,
            isCurrent: session.isOnline,
            eventCount: session.events.length,
            events: session.events.map((e) => ({
              id: e.id,
              at: e.at,
              label: e.label,
              category: eventCategory(e.eventName).label,
              tone: eventCategory(e.eventName).tone,
              outcome: null,
              monetization: e.monetization,
            })),
          },
        ]
      : [],
    intent: {
      ...base.intent,
      steps: intentJourney({
        pricingViews: u.pricingViews30d,
        proClicks: u.planClicks30d,
        premiumClicks: u.lastPremiumClick ? 1 : 0,
        checkoutsStarted: u.checkoutStarted30d,
        checkoutsAbandoned: u.checkoutAbandoned ? 1 : 0,
        paymentAttempts: u.paymentFailed ? 1 : 0,
      }),
      recommendedPlan: recommendedPlan(u.lastPremiumClick ? "premium_clicked" : null, u.isPaid, u.plan),
    },
    sales: {
      ...base.sales,
      leadId: u.ownerId ? `mock-lead-${userId}` : null,
      ownerId: u.ownerId,
      ownerName: u.ownerName,
      status: u.ownerName ? "Contacted" : "Uncontacted",
      leadCreatedAt: u.priority ? new Date(now - 42 * MIN).toISOString() : null,
      slaDueAt: u.priority === "P0" ? new Date(now + 12 * MIN).toISOString() : null,
    },
    applications: mockApplications(now, Math.min(10, Math.max(2, Math.round(u.autoAppliesUsed / 5)))),
    support: {
      ...base.support,
      autoApplyFailuresLifetime: u.autoApplyFailures7d * 2,
      autoApplyFailures7d: u.autoApplyFailures7d,
      paymentFailures: u.paymentFailed ? 1 : 0,
      status: u.autoApplyFailures7d >= 3 || u.paymentFailed ? "Needs attention" : "Healthy",
    },
  };
}

export function mockUserProfile(userId: string, reason: string, now = Date.now()): UserProfileData | null {
  const profile = userId === "TJO-14882" ? referenceProfile(now) : derivedProfile(userId, now);
  if (!profile) return null;
  return {
    ...profile,
    source: { kind: "demo", reason },
    rawEvents: {
      rows: profile.sessions
        .flatMap((s) => s.events.map((e) => ({ ...e, sessionId: s.sessionId })))
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .map((e) => ({
          id: e.id,
          name: e.label,
          label: e.label,
          at: e.at,
          page: null,
          source: "client",
          properties: {},
        })),
      nextCursor: null,
    },
  };
}

export function mockDirectory(query: string, reason: string, now = Date.now()): DirectoryData {
  const ids = ["TJO-14882", "TJO-15103", "TJO-14921", "TJO-14433", "TJO-14582", "TJO-14955", "TJO-14702", "TJO-15088", "TJO-14831", "TJO-14478", "TJO-15112", "TJO-15140", "TJO-14207", "TJO-14610", "TJO-15131", "TJO-14398", "TJO-14215", "TJO-14120"];
  const needle = query.trim().toLowerCase();
  const rows = ids
    .map((id) => {
      const profile = mockUserProfile(id, reason, now);
      if (!profile) return null;
      const u = profile.user;
      const usage = profile.metrics.find((m) => m.key === "auto_applies")?.bar ?? { used: 0, limit: 50 };
      return {
        userId: u.userId,
        displayId: u.displayId,
        name: u.name,
        email: u.email,
        country: u.country,
        plan: u.plan,
        isPaid: u.isPaid,
        isOnline: u.isOnline,
        lifecycleStage: u.lifecycleStage,
        pqlScore: u.pqlScore,
        priority: u.priority,
        autoApplyUsed: usage.used,
        autoApplyLimit: usage.limit,
        lastActiveAt: u.lastActiveAt,
        ownerName: profile.sales.ownerName,
      } satisfies DirectoryRow;
    })
    .filter((r): r is DirectoryRow => r !== null)
    .filter(
      (r) =>
        !needle ||
        r.name.toLowerCase().includes(needle) ||
        r.userId.toLowerCase().includes(needle) ||
        (r.email ?? "").toLowerCase().includes(needle) ||
        (r.country ? countryName(r.country).toLowerCase().includes(needle) : false)
    )
    .sort((a, b) => b.pqlScore - a.pqlScore);

  return { source: { kind: "demo", reason }, generatedAt: new Date(now).toISOString(), query, rows, total: rows.length };
}
