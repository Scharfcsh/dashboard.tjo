import type {
  AlertGroup,
  DashboardFilters,
  FilterOption,
  FunnelStage,
  GrowthPoint,
  IntelligenceMetric,
  KpiCardData,
  OpportunityRow,
  RevenueCommandCenterData,
  SalesTeamData,
  TimelineEvent,
  User360View,
} from "@/lib/revenue-center/types";

// ---------------------------------------------------------------------------
// Demo data for the Revenue Command Center. Used when the analytics database is
// unreachable or has no users yet. Mirrors the approved reference design, and
// produces exactly the same view-model the live loader builds.
//
// Deterministic (no Math.random) so server and client render the same markup;
// timestamps are relative to `now`.
// ---------------------------------------------------------------------------

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const dashboardMetrics = {
  totalUsers: 1488,
  newToday: 43,
  activeToday: 50,
  hotPqls: 11,
  pricingVisitors: 13,
  pricingViews: 21,
  checkoutStarted: 5,
  checkoutAbandoned: 3,
  paidToday: 3,
  revenueToday: 837,
};

function kpis(): KpiCardData[] {
  const m = dashboardMetrics;
  return [
    {
      key: "total_users",
      label: "Total Users",
      icon: "users",
      tone: "teal",
      value: m.totalUsers,
      format: "number",
      secondary: `+${m.newToday} today`,
      secondaryTone: "teal",
      changePct: 18.4,
      badge: null,
      focus: null,
      definition: "Identified users whose signup is before the end of the range.",
    },
    {
      key: "active_users",
      label: "Active Today",
      icon: "activity",
      tone: "green",
      value: m.activeToday,
      format: "number",
      secondary: "3.4% of total users",
      changePct: 11,
      badge: null,
      focus: "online",
      definition: "Distinct users with at least one meaningful product action today.",
    },
    {
      key: "hot_pqls",
      label: "Hot PQLs",
      icon: "flame",
      tone: "amber",
      value: m.hotPqls,
      format: "number",
      secondary: "Need immediate follow-up",
      changePct: null,
      badge: { label: "Revenue Opportunity", tone: "amber" },
      focus: "hot",
      definition: "Unpaid users with a current PQL score of 75 or more.",
    },
    {
      key: "pricing_visitors",
      label: "Pricing Visitors",
      icon: "eye",
      tone: "blue",
      value: m.pricingVisitors,
      format: "number",
      secondary: `${m.pricingViews} pricing views`,
      changePct: 23,
      badge: null,
      focus: "pricing",
      definition: "Distinct users who opened the pricing page in the range.",
    },
    {
      key: "checkout_started",
      label: "Checkout Started",
      icon: "cart",
      tone: "red",
      value: m.checkoutStarted,
      format: "number",
      secondary: `${m.checkoutAbandoned} abandoned`,
      changePct: null,
      badge: { label: "High Intent", tone: "red" },
      focus: "checkout",
      definition: "Distinct users who started checkout; abandoned = no payment within 30 minutes.",
    },
    {
      key: "paid",
      label: "Paid Today",
      icon: "wallet",
      tone: "teal",
      value: m.paidToday,
      format: "number",
      secondary: `₹${m.revenueToday.toLocaleString("en-IN")} revenue`,
      changePct: 50,
      badge: null,
      focus: null,
      definition: "Users whose first successful payment happened in the range.",
    },
  ];
}

function secondaryKpis(): KpiCardData[] {
  const card = (k: Partial<KpiCardData> & Pick<KpiCardData, "key" | "label" | "icon" | "tone" | "value" | "definition">): KpiCardData => ({
    format: "number",
    secondary: null,
    changePct: null,
    badge: null,
    focus: null,
    ...k,
  });
  return [
    card({ key: "usage40", label: "40+ Free Applies Used", icon: "file", tone: "blue", value: 9, focus: "usage40", definition: "Unpaid users with 40+ free Auto Applies used." }),
    card({ key: "usage45", label: "45+ Free Applies Used", icon: "file", tone: "blue", value: 6, focus: "usage45", definition: "Unpaid users with 45+ free Auto Applies used." }),
    card({ key: "quota", label: "50/50 Exhausted", icon: "alert", tone: "red", value: 5, badge: { label: "Call Now", tone: "red" }, focus: "quota", definition: "Unpaid users who used their full free Auto Apply allowance." }),
    card({ key: "payment_failed", label: "Payment Failed", icon: "x-circle", tone: "red", value: 1, badge: { label: "Recover Revenue", tone: "red" }, focus: "payment_failed", definition: "Users with a failed payment in the range." }),
    card({ key: "dormant", label: "Dormant 3 Days", icon: "moon", tone: "purple", value: 24, definition: "Unpaid users last active 3–30 days ago." }),
    card({ key: "returned", label: "Returned Users", icon: "refresh", tone: "teal", value: 4, definition: "Users who came back after a dormant period." }),
  ];
}

function funnel(): FunnelStage[] {
  const stages: [string, string, FunnelStage["icon"], FunnelStage["tone"], number][] = [
    ["active", "Active Users", "users", "teal", 50],
    ["activated", "Activated", "zap", "blue", 37],
    ["core_feature", "Core Feature Users", "target", "indigo", 28],
    ["pql", "Product Qualified Leads", "sparkles", "purple", 18],
    ["pricing", "Pricing Intent", "flame", "amber", 9],
    ["checkout", "Checkout", "cart", "red", 5],
    ["paid", "Paid", "wallet", "green", 3],
  ];
  return stages.map(([key, label, icon, tone, count], i) => ({
    key,
    label,
    icon,
    tone,
    count,
    independentCount: count,
    conversionFromPrevious: i === 0 ? null : Math.round((count / stages[i - 1]![4]) * 100),
    conversionFromStart: Math.round((count / 50) * 100),
  }));
}

function alerts(now: number): AlertGroup[] {
  const at = (ms: number) => new Date(now - ms).toISOString();
  return [
    { id: "quota_exhausted", text: "5 users reached 50/50 free Auto Applies", severity: "critical", icon: "alert", tone: "red", count: 5, latestAt: at(10 * MIN) },
    { id: "checkout_abandoned", text: "3 users abandoned checkout", severity: "critical", icon: "cart", tone: "red", count: 3, latestAt: at(22 * MIN) },
    { id: "payment_failed", text: "1 payment failure requires follow-up", severity: "recovery", icon: "x-circle", tone: "red", count: 1, latestAt: at(HOUR) },
    { id: "near_limit", text: "6 users reached 45+ applications", severity: "warning", icon: "file", tone: "amber", count: 6, latestAt: at(2 * HOUR) },
    { id: "dormant_power_user_returned", text: "4 high-value dormant users returned", severity: "opportunity", icon: "users", tone: "indigo", count: 4, latestAt: at(3 * HOUR) },
    { id: "repeated_failure", text: "3 heavy users experienced repeated Auto Apply failures", severity: "warning", icon: "alert", tone: "purple", count: 3, latestAt: at(5 * HOUR) },
  ];
}

interface MockPerson {
  row: Omit<OpportunityRow, "lastSeenAt" | "lastContactAt">;
  seenAgo: number | null;
  contactAgo: number | null;
  city: string;
  email: string;
  phone: string;
  source: string;
  campaign: string;
  stage: string;
  signupDaysAgo: number;
}

const person = (
  row: Omit<OpportunityRow, "lastSeenAt" | "lastContactAt" | "autoApplyLimit" | "leadId" | "paymentFailed"> &
    Partial<Pick<OpportunityRow, "paymentFailed">>,
  extra: Omit<MockPerson, "row">
): MockPerson => ({ row: { autoApplyLimit: 50, leadId: `lead-${row.displayId}`, paymentFailed: false, ...row }, ...extra });

const PEOPLE: MockPerson[] = [
  person(
    { userId: "TJO-14882", displayId: "TJO-14882", name: "Vishal Sharma", country: "IN", isOnline: true, autoApplyUsed: 50, pricingViews: 4, checkoutStatus: "started", checkoutLabel: "Not completed", pqlScore: 96, priority: "P0", whyHot: "Quota exhausted + pricing viewed repeatedly", ownerName: "Rahul", action: "call_now" },
    { seenAgo: 0, contactAgo: 7 * MIN, city: "Bengaluru", email: "vi******@gmail.com", phone: "+91 ******8210", source: "Instagram", campaign: "bangalore_reel_07", stage: "pql", signupDaysAgo: 26 }
  ),
  person(
    { userId: "TJO-14761", displayId: "TJO-14761", name: "Priya Mehta", country: "IN", isOnline: false, autoApplyUsed: 48, pricingViews: 3, checkoutStatus: "plan_selected", checkoutLabel: "Pro selected", pqlScore: 91, priority: "P1", whyHot: "Near limit + plan selected", ownerName: "Sneha", action: "follow_up" },
    { seenAgo: 6 * MIN, contactAgo: HOUR, city: "Mumbai", email: "pr******@outlook.com", phone: "+91 ******4417", source: "Google", campaign: "brand_search", stage: "pql", signupDaysAgo: 19 }
  ),
  person(
    { userId: "TJO-14620", displayId: "TJO-14620", name: "John Davis", country: "US", isOnline: false, autoApplyUsed: 44, pricingViews: 5, checkoutStatus: "abandoned", checkoutLabel: "Abandoned", pqlScore: 94, priority: "P0", whyHot: "Checkout abandoned", ownerName: "Amit", action: "recover" },
    { seenAgo: 11 * MIN, contactAgo: 26 * HOUR, city: "Austin", email: "jo******@gmail.com", phone: "+1 ******0123", source: "LinkedIn", campaign: "us_engineers_q3", stage: "pql", signupDaysAgo: 33 }
  ),
  person(
    { userId: "TJO-15012", displayId: "TJO-15012", name: "Aarav Shah", country: "AE", isOnline: true, autoApplyUsed: 50, pricingViews: 2, checkoutStatus: "not_started", checkoutLabel: "Not started", pqlScore: 88, priority: "P0", whyHot: "50/50 exhausted, not upgraded", ownerName: "Rahul", action: "call_now" },
    { seenAgo: 0, contactAgo: null, city: "Dubai", email: "aa******@gmail.com", phone: "+971 ******3391", source: "YouTube", campaign: "gulf_jobs_explainer", stage: "pql", signupDaysAgo: 12 }
  ),
  person(
    { userId: "TJO-14955", displayId: "TJO-14955", name: "Neha Kapoor", country: "IN", isOnline: false, autoApplyUsed: 47, pricingViews: 6, checkoutStatus: "plan_selected", checkoutLabel: "Premium selected", pqlScore: 86, priority: "P1", whyHot: "Pricing viewed 6x with 40+ applies used", ownerName: "Sneha", action: "follow_up" },
    { seenAgo: 18 * MIN, contactAgo: 3 * HOUR, city: "Delhi", email: "ne******@yahoo.com", phone: "+91 ******7702", source: "Instagram", campaign: "delhi_reel_03", stage: "pql", signupDaysAgo: 22 }
  ),
  person(
    { userId: "TJO-14478", displayId: "TJO-14478", name: "Daniel Wilson", country: "GB", isOnline: false, autoApplyUsed: 38, pricingViews: 2, checkoutStatus: "not_started", checkoutLabel: "Not started", pqlScore: 79, priority: null, whyHot: "Payment failed on renewal", ownerName: "Amit", action: "recover", paymentFailed: true },
    { seenAgo: 42 * MIN, contactAgo: null, city: "London", email: "da******@gmail.com", phone: "+44 ******5521", source: "LinkedIn", campaign: "uk_tech", stage: "paid", signupDaysAgo: 64 }
  ),
  person(
    { userId: "TJO-15088", displayId: "TJO-15088", name: "Rohan Iyer", country: "IN", isOnline: true, autoApplyUsed: 46, pricingViews: 1, checkoutStatus: "not_started", checkoutLabel: "Not started", pqlScore: 74, priority: "P1", whyHot: "46 of 50 free Auto Applies used", ownerName: null, action: "follow_up" },
    { seenAgo: 0, contactAgo: null, city: "Chennai", email: "ro******@gmail.com", phone: "+91 ******1180", source: "Campus", campaign: "campus_ambassador", stage: "power_user", signupDaysAgo: 9 }
  ),
  person(
    { userId: "TJO-14390", displayId: "TJO-14390", name: "Sneha Patel", country: "IN", isOnline: false, autoApplyUsed: 41, pricingViews: 3, checkoutStatus: "started", checkoutLabel: "Not completed", pqlScore: 82, priority: "P1", whyHot: "Returned after 9 days + pricing viewed", ownerName: "Rahul", action: "follow_up" },
    { seenAgo: 2 * HOUR, contactAgo: 2 * DAY, city: "Ahmedabad", email: "sn******@gmail.com", phone: "+91 ******9034", source: "Google", campaign: "generic_jobs", stage: "resurrected", signupDaysAgo: 41 }
  ),
  person(
    { userId: "TJO-15127", displayId: "TJO-15127", name: "Fatima Khan", country: "AE", isOnline: false, autoApplyUsed: 35, pricingViews: 2, checkoutStatus: "plan_selected", checkoutLabel: "Pro selected", pqlScore: 71, priority: null, whyHot: "Plan clicked + 3 sessions this week", ownerName: null, action: "follow_up" },
    { seenAgo: 3 * HOUR, contactAgo: null, city: "Abu Dhabi", email: "fa******@hotmail.com", phone: "+971 ******2208", source: "Referral", campaign: "friend_invite", stage: "engaged", signupDaysAgo: 15 }
  ),
  person(
    { userId: "TJO-14702", displayId: "TJO-14702", name: "Rahul Verma", country: "CA", isOnline: false, autoApplyUsed: 29, pricingViews: 4, checkoutStatus: "not_started", checkoutLabel: "Not started", pqlScore: 66, priority: "P2", whyHot: "Activated this week", ownerName: null, action: "follow_up" },
    { seenAgo: 5 * HOUR, contactAgo: null, city: "Toronto", email: "ra******@gmail.com", phone: "+1 ******6674", source: "YouTube", campaign: "canada_pr_jobs", stage: "activated", signupDaysAgo: 6 }
  ),
];

function opportunities(now: number): OpportunityRow[] {
  return PEOPLE.map(({ row, seenAgo, contactAgo }) => ({
    ...row,
    lastSeenAt: seenAgo === null ? null : new Date(now - seenAgo).toISOString(),
    lastContactAt: contactAgo === null ? null : new Date(now - contactAgo).toISOString(),
  }));
}

/** Smooth, deterministic 30-day story: usage grows, PQLs follow, payments trail. */
export function mockGrowth(days: number, now: number): GrowthPoint[] {
  const points: GrowthPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = (days - 1 - i) / Math.max(1, days - 1);
    const wave = Math.sin((days - i) * 0.9) * 6 + Math.sin((days - i) * 0.37) * 4;
    const date = new Date(now - i * DAY).toISOString().slice(0, 10);
    const active = Math.round(58 + t * 70 + wave);
    points.push({
      date,
      active,
      pqls: Math.round(22 + t * 20 + wave * 0.35),
      paid: Math.round(12 + t * 14 + wave * 0.15),
    });
  }
  return points;
}

const salesTeam: SalesTeamData = {
  pipeline: [
    { key: "warm_leads", label: "Warm leads", value: 50 },
    { key: "assigned", label: "Assigned", value: 32 },
    { key: "contacted", label: "Contacted", value: 21 },
    { key: "connected", label: "Connected", value: 12 },
    { key: "interested", label: "Interested", value: 7 },
    { key: "converted", label: "Converted", value: 3 },
  ],
  performers: [
    { name: "Rahul Kumar", contacts: 8 },
    { name: "Sneha Patel", contacts: 6 },
    { name: "Amit Singh", contacts: 5 },
  ],
};

const intelligence: IntelligenceMetric[] = [
  { key: "activation_rate", label: "Activation Rate", icon: "zap", tone: "amber", value: 74, format: "percent", change: 6, changeUnit: "pts", definition: "Signups in the last 30 days that reached activation." },
  { key: "d1_retention", label: "D1 Retention", icon: "user-check", tone: "blue", value: 42, format: "percent", change: 4, changeUnit: "pts", definition: "Signups active on the day after signup." },
  { key: "d7_retention", label: "D7 Retention", icon: "calendar", tone: "blue", value: 28, format: "percent", change: 3, changeUnit: "pts", definition: "Signups active seven days after signup." },
  { key: "free_to_paid", label: "Free-to-Paid Rate", icon: "filter", tone: "purple", value: 1.8, format: "percent", change: 0.4, changeUnit: "pts", definition: "First payments / active users, last 30 days." },
  { key: "pricing_to_checkout", label: "Pricing-to-Checkout Rate", icon: "cart", tone: "green", value: 38, format: "percent", change: 6, changeUnit: "pts", definition: "Checkout starters / pricing visitors, last 30 days." },
  { key: "checkout_to_paid", label: "Checkout-to-Paid Rate", icon: "credit-card", tone: "blue", value: 60, format: "percent", change: 8, changeUnit: "pts", definition: "First payments / checkout starters, last 30 days." },
  { key: "avg_pql", label: "Average PQL Score", icon: "gauge", tone: "red", value: 72, format: "number", change: 5, changeUnit: "%", definition: "Mean PQL score of unpaid users active in the last 30 days." },
  { key: "arppu", label: "Average Revenue Per Paid User", icon: "coins", tone: "amber", value: 279, format: "currency", change: 12, changeUnit: "%", definition: "Revenue / paying users charged, last 30 days." },
];

const COUNTRY_OPTIONS: FilterOption[] = [
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
  { value: "AE", label: "UAE" },
  { value: "GB", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
];

const SOURCE_OPTIONS: FilterOption[] = ["instagram", "google", "linkedin", "youtube", "campus", "referral"].map((s) => ({
  value: s,
  label: s[0]!.toUpperCase() + s.slice(1),
}));

export function mockRevenueCommandCenter(filters: DashboardFilters, reason: string, now = Date.now()): RevenueCommandCenterData {
  let rows = opportunities(now);
  if (filters.country) rows = rows.filter((r) => r.country === filters.country);
  if (filters.source) {
    const bySource = new Set(PEOPLE.filter((p) => p.source.toLowerCase() === filters.source).map((p) => p.row.userId));
    rows = rows.filter((r) => bySource.has(r.userId));
  }
  const alertList = alerts(now);
  return {
    source: { kind: "demo", reason },
    generatedAt: new Date(now).toISOString(),
    filters,
    status: { state: "demo", label: "Demo data", detail: reason },
    kpis: kpis(),
    secondaryKpis: secondaryKpis(),
    funnel: funnel(),
    alerts: alertList,
    openAlertCount: alertList.length,
    opportunities: rows,
    opportunitiesTotal: rows.length,
    growth: mockGrowth(filters.chart, now),
    salesTeam,
    intelligence,
    countryOptions: COUNTRY_OPTIONS,
    sourceOptions: SOURCE_OPTIONS,
  };
}

const TEAM: FilterOption[] = [
  { value: "mock-rahul", label: "Rahul Kumar" },
  { value: "mock-sneha", label: "Sneha Patel" },
  { value: "mock-amit", label: "Amit Singh" },
];

export function mockUser360(userId: string, now = Date.now()): User360View | null {
  const p = PEOPLE.find((x) => x.row.userId === userId);
  if (!p) return null;
  const at = (ms: number) => new Date(now - ms).toISOString();
  const seen = p.seenAgo ?? 0;
  const activity: TimelineEvent[] = [
    { id: "a1", at: at(seen), label: "Opened pricing page", detail: "/pricing", tone: "amber" },
    { id: "a2", at: at(seen + 3 * MIN), label: "Used Auto Apply", detail: "Senior Frontend Engineer · Razorpay", tone: "teal" },
    { id: "a3", at: at(seen + 7 * MIN), label: "Applied to 5 jobs", detail: "Auto Apply batch", tone: "teal" },
    { id: "a4", at: at(seen + 12 * MIN), label: "Returned to dashboard", detail: "/jobs", tone: "slate" },
    { id: "a5", at: at(seen + 14 * MIN), label: "Logged in", detail: null, tone: "slate" },
    { id: "a6", at: at(seen + DAY), label: "Clicked Pro plan", detail: "Monthly · pricing page", tone: "purple" },
  ];
  return {
    userId: p.row.userId,
    displayId: p.row.displayId,
    name: p.row.name,
    email: p.email,
    phone: p.phone,
    country: p.row.country,
    city: p.city,
    plan: p.stage === "paid" ? "PRO" : "FREE",
    isPaid: p.stage === "paid",
    isOnline: p.row.isOnline,
    lifecycleStage: p.stage,
    signupAt: at(p.signupDaysAgo * DAY),
    lastActiveAt: at(seen),
    acquisition: { source: p.source, campaign: p.campaign },
    pql: {
      score: p.row.pqlScore,
      category: p.row.pqlScore >= 90 ? "buy_now" : p.row.pqlScore >= 75 ? "hot" : "warm",
      priority: p.row.priority,
      reason: p.row.whyHot,
      nextBestAction: p.row.action === "call_now" ? "call_now" : p.row.action === "recover" ? "checkout_recovery" : "send_whatsapp",
      reasons: [
        { label: p.row.autoApplyUsed >= 50 ? "50/50 free applies used" : "45 free applies used", points: p.row.autoApplyUsed >= 50 ? 20 : 10 },
        { label: "Checkout started", points: 20 },
        { label: "Plan clicked", points: 12 },
        { label: "Pricing viewed 2+ times", points: 8 },
        { label: "Resume uploaded", points: 5 },
      ],
    },
    autoApply: { used: p.row.autoApplyUsed, limit: 50, successful: Math.round(p.row.autoApplyUsed * 0.87), failed: Math.round(p.row.autoApplyUsed * 0.13) },
    intent: {
      pricingViews: p.row.pricingViews,
      planClicks: p.row.checkoutStatus === "not_started" ? 0 : 2,
      checkoutsStarted: p.row.checkoutStatus === "started" || p.row.checkoutStatus === "abandoned" ? 1 : 0,
      checkoutsAbandoned: p.row.checkoutStatus === "abandoned" ? 1 : 0,
    },
    session: { startedAt: at(seen + 14 * MIN), durationSeconds: 14 * 60 + 21, device: "Desktop · Chrome", isCurrent: p.row.isOnline },
    activity,
    sales: {
      leadId: p.row.leadId,
      leadStatus: p.contactAgo === null ? "new" : "contacted",
      ownerId: TEAM.find((t) => t.label.startsWith(p.row.ownerName ?? "—"))?.value ?? null,
      ownerName: p.row.ownerName,
      lastContactAt: p.contactAgo === null ? null : at(p.contactAgo),
      contacts:
        p.contactAgo === null
          ? []
          : [
              { id: "c1", type: "call", summary: "Call · connected · discussed Pro plan", actorName: p.row.ownerName, at: at(p.contactAgo) },
              { id: "c2", type: "whatsapp", summary: "WhatsApp · sent plan comparison", actorName: p.row.ownerName, at: at(p.contactAgo + 2 * HOUR) },
            ],
    },
    team: TEAM,
  };
}
