import "server-only";
import { maskEmail, maskPhone } from "@/lib/pii";
import { countryName } from "@/lib/revenue-center/format";
import type { FilterOption, User360View } from "@/lib/revenue-center/types";
import { currentAction, pageInfo, pricingIntent, INTENT_META, lastEventLabel } from "@/lib/live-intelligence/derive";
import { MOCK_EVENT_POOL } from "@/lib/live-intelligence/event-pool";
import type { LiveIntelligenceData, LiveSession, LiveUser } from "@/lib/live-intelligence/types";

// ---------------------------------------------------------------------------
// Demo data for Live User Intelligence (used when the analytics database is
// unavailable or empty). Deterministic; all times are relative to `now`.
// ---------------------------------------------------------------------------

const S = 1000;
const MIN = 60 * S;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

interface Seed extends Omit<LiveUser, "email" | "phone" | "lastSeenAt" | "sessionStartedAt" | "signupAt"> {
  email: string;
  phone: string;
  seenAgo: number;
  sessionSeconds: number | null;
  signupAgo: number;
}

const seed = (s: Partial<Seed> & Pick<Seed, "userId" | "name" | "email" | "phone" | "country">): Seed => ({
  displayId: s.userId,
  plan: "FREE",
  isPaid: false,
  source: "google",
  lifecycleStage: "engaged",
  isOnline: true,
  currentPage: "/jobs",
  lastEventName: "job_viewed",
  autoAppliesUsed: 10,
  autoApplyLimit: 50,
  autoApplyFailures7d: 0,
  pricingViews30d: 0,
  planClicks30d: 0,
  checkoutStarted30d: 0,
  checkoutAbandoned: false,
  paymentFailed: false,
  lastPremiumClick: false,
  pqlScore: 40,
  priority: null,
  nextBestAction: "continue_product_nurture",
  ownerId: null,
  ownerName: null,
  seenAgo: 20 * S,
  sessionSeconds: 5 * 60,
  signupAgo: 30 * DAY,
  ...s,
});

const SEEDS: Seed[] = [
  seed({ userId: "TJO-15103", name: "Rohit Singh", email: "rohit.singh@gmail.com", phone: "+91 98110 45327", country: "IN", source: "instagram", lifecycleStage: "pql", currentPage: "/jobs", lastEventName: "auto_apply_success", sessionSeconds: 12 * 60 + 42, autoAppliesUsed: 48, pricingViews30d: 3, planClicks30d: 1, lastPremiumClick: true, pqlScore: 92, priority: "P0", nextBestAction: "call_now", ownerId: "mock-rahul", ownerName: "Rahul", seenAgo: 8 * S, signupAgo: 24 * DAY }),
  seed({ userId: "TJO-14921", name: "Emily Carter", email: "emily.carter@outlook.com", phone: "+1 415 555 0192", country: "US", source: "linkedin", lifecycleStage: "pql", currentPage: "/pricing", lastEventName: "premium_clicked", sessionSeconds: 7 * 60 + 10, autoAppliesUsed: 31, pricingViews30d: 4, pqlScore: 87, priority: "P1", nextBestAction: "show_upgrade_prompt", seenAgo: 15 * S, signupAgo: 18 * DAY }),
  seed({ userId: "TJO-14831", name: "Aditya Verma", email: "aditya.verma@gmail.com", phone: "+91 99870 11234", country: "IN", lifecycleStage: "activated", currentPage: "/resume", lastEventName: "resume_analyzed", sessionSeconds: 18 * 60 + 3, autoAppliesUsed: 12, pqlScore: 43, seenAgo: 30 * S, signupAgo: 9 * DAY }),
  seed({ userId: "TJO-14582", name: "John Davis", email: "john.davis@gmail.com", phone: "+44 7700 900123", country: "GB", source: "linkedin", lifecycleStage: "pql", currentPage: "/checkout", lastEventName: "checkout_started", sessionSeconds: 9 * 60 + 21, autoAppliesUsed: 50, pricingViews30d: 5, planClicks30d: 2, checkoutStarted30d: 1, pqlScore: 76, priority: "P0", nextBestAction: "checkout_recovery", ownerId: "mock-priya", ownerName: "Priya", seenAgo: 12 * S, signupAgo: 33 * DAY }),
  seed({ userId: "TJO-14398", name: "Priya Mehta", email: "priya.mehta@yahoo.com", phone: "+91 98200 76541", country: "IN", source: "google", lifecycleStage: "engaged", isOnline: false, currentPage: "/matches", lastEventName: "job_viewed", sessionSeconds: 4 * 60 + 18, autoAppliesUsed: 8, pricingViews30d: 1, pqlScore: 58, nextBestAction: "send_whatsapp", ownerId: "mock-neha", ownerName: "Neha", seenAgo: 6 * MIN, signupAgo: 41 * DAY }),
  seed({ userId: "TJO-15112", name: "Sara Khan", email: "sara.khan@gmail.com", phone: "+1 647 555 0148", country: "CA", source: "campus", lifecycleStage: "new", currentPage: "/profile", lastEventName: "preference_added", sessionSeconds: 6 * 60 + 55, autoAppliesUsed: 3, pqlScore: 36, priority: "P2", nextBestAction: "send_activation_reminder", seenAgo: 25 * S, signupAgo: 2 * HOUR }),
  seed({ userId: "TJO-14882", name: "Vishal Sharma", email: "vishal.sharma@gmail.com", phone: "+91 98765 48210", country: "IN", source: "instagram", lifecycleStage: "pql", currentPage: "/pricing", lastEventName: "plan_compared", sessionSeconds: 14 * 60 + 5, autoAppliesUsed: 50, pricingViews30d: 4, planClicks30d: 1, pqlScore: 96, priority: "P0", nextBestAction: "call_now", ownerId: "mock-rahul", ownerName: "Rahul", seenAgo: 5 * S, signupAgo: 26 * DAY }),
  seed({ userId: "TJO-14955", name: "Neha Kapoor", email: "neha.kapoor@gmail.com", phone: "+91 97111 20983", country: "IN", source: "instagram", lifecycleStage: "power_user", currentPage: "/autoapply", lastEventName: "auto_apply_started", sessionSeconds: 22 * 60 + 40, autoAppliesUsed: 46, pricingViews30d: 2, pqlScore: 81, priority: "P1", nextBestAction: "send_whatsapp", ownerId: "mock-sneha", ownerName: "Sneha", seenAgo: 40 * S, signupAgo: 22 * DAY }),
  seed({ userId: "TJO-14478", name: "Daniel Wilson", email: "daniel.wilson@gmail.com", phone: "+44 7700 900456", country: "GB", source: "linkedin", lifecycleStage: "paid", plan: "PRO", isPaid: true, currentPage: "/applications", lastEventName: "auto_apply_failed", sessionSeconds: 11 * 60 + 12, autoAppliesUsed: 38, autoApplyFailures7d: 3, pqlScore: 64, nextBestAction: "route_to_product_support", seenAgo: 50 * S, signupAgo: 64 * DAY }),
  seed({ userId: "TJO-15088", name: "Arjun Patel", email: "arjun.patel@gmail.com", phone: "+971 50 555 3391", country: "AE", source: "youtube", lifecycleStage: "engaged", currentPage: "/jobs", lastEventName: "search_performed", sessionSeconds: 3 * 60 + 2, autoAppliesUsed: 41, pricingViews30d: 1, pqlScore: 68, seenAgo: 70 * S, signupAgo: 15 * DAY }),
  seed({ userId: "TJO-15131", name: "Sarah Johnson", email: "sarah.johnson@gmail.com", phone: "+1 212 555 0177", country: "US", source: "referral", lifecycleStage: "activated", currentPage: "/matches", lastEventName: "job_saved", sessionSeconds: 1 * 60 + 35, autoAppliesUsed: 17, pqlScore: 49, seenAgo: 90 * S, signupAgo: 6 * DAY }),
  seed({ userId: "TJO-14702", name: "Rahul Shah", email: "rahul.shah@gmail.com", phone: "+91 90040 55218", country: "IN", source: "google", lifecycleStage: "resurrected", currentPage: "/pricing", lastEventName: "pricing_viewed", sessionSeconds: 2 * 60 + 48, autoAppliesUsed: 44, pricingViews30d: 2, pqlScore: 72, priority: "P1", nextBestAction: "win_back_campaign", seenAgo: 2 * MIN, signupAgo: 58 * DAY }),
  seed({ userId: "TJO-15140", name: "Meera Nair", email: "meera.nair@gmail.com", phone: "+91 94470 33120", country: "IN", source: "campus", lifecycleStage: "new", currentPage: "/onboarding", lastEventName: "signup_completed", sessionSeconds: 55, autoAppliesUsed: 0, pqlScore: 13, seenAgo: 45 * S, signupAgo: 20 * MIN }),
  seed({ userId: "TJO-14610", name: "Lucas Brown", email: "lucas.brown@gmail.com", phone: "+61 412 555 019", country: "AU", source: "youtube", lifecycleStage: "engaged", isOnline: false, currentPage: "/resume", lastEventName: "resume_tailored", sessionSeconds: 26 * 60 + 9, autoAppliesUsed: 29, pricingViews30d: 1, pqlScore: 55, seenAgo: 3 * MIN, signupAgo: 27 * DAY }),
  seed({ userId: "TJO-14433", name: "Kavya Reddy", email: "kavya.reddy@gmail.com", phone: "+91 98480 71652", country: "IN", source: "instagram", lifecycleStage: "pql", isOnline: false, currentPage: "/checkout", lastEventName: "checkout_started", sessionSeconds: 8 * 60, autoAppliesUsed: 50, pricingViews30d: 3, planClicks30d: 1, checkoutStarted30d: 1, checkoutAbandoned: true, pqlScore: 94, priority: "P0", nextBestAction: "checkout_recovery", seenAgo: 42 * MIN, signupAgo: 30 * DAY }),
  seed({ userId: "TJO-14207", name: "Omar Haddad", email: "omar.haddad@gmail.com", phone: "+971 55 555 7120", country: "AE", source: "linkedin", lifecycleStage: "paid", plan: "PREMIUM", isPaid: true, isOnline: false, currentPage: "/billing", lastEventName: "pricing_viewed", sessionSeconds: 3 * 60, autoAppliesUsed: 22, paymentFailed: true, pqlScore: 79, priority: "P0", nextBestAction: "payment_recovery", ownerId: "mock-amit", ownerName: "Amit", seenAgo: 2 * HOUR, signupAgo: 90 * DAY }),
  seed({ userId: "TJO-14120", name: "Ananya Iyer", email: "ananya.iyer@gmail.com", phone: "+91 99000 84412", country: "IN", source: "google", lifecycleStage: "dormant", isOnline: false, currentPage: "/jobs", lastEventName: "job_viewed", sessionSeconds: null, autoAppliesUsed: 19, pqlScore: 21, seenAgo: 3 * DAY, signupAgo: 50 * DAY }),
  seed({ userId: "TJO-14215", name: "Tom Becker", email: "tom.becker@gmail.com", phone: "+49 151 5550 1234", country: "DE", source: "referral", lifecycleStage: "activated", isOnline: false, currentPage: "/applications", lastEventName: "auto_apply_success", sessionSeconds: null, autoAppliesUsed: 26, pqlScore: 47, seenAgo: 5 * HOUR, signupAgo: 12 * DAY }),
];

function toUser(s: Seed, now: number): LiveUser {
  const { email, phone, seenAgo, sessionSeconds, signupAgo, ...rest } = s;
  return {
    ...rest,
    email: maskEmail(email),
    phone: maskPhone(phone),
    lastSeenAt: new Date(now - seenAgo).toISOString(),
    sessionStartedAt: sessionSeconds === null ? null : new Date(now - seenAgo - sessionSeconds * S).toISOString(),
    signupAt: new Date(now - signupAgo).toISOString(),
  };
}

function matchesQuery(s: Seed, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");
  return (
    s.name.toLowerCase().includes(needle) ||
    s.userId.toLowerCase().includes(needle) ||
    s.email.toLowerCase().includes(needle) ||
    (digits.length >= 3 && s.phone.replace(/\D/g, "").includes(digits))
  );
}

const EVENT_AGES = [2 * MIN, 5 * MIN, 12 * MIN, 28 * MIN, 42 * MIN, HOUR];

export function mockLiveIntelligence(query: string, reason: string, now = Date.now()): LiveIntelligenceData {
  const users = SEEDS.filter((s) => matchesQuery(s, query)).map((s) => toUser(s, now));
  const countries = [...new Set(SEEDS.map((s) => s.country).filter((c): c is string => c !== null))].sort();
  const countryOptions: FilterOption[] = countries.map((c) => ({ value: c, label: countryName(c) }));
  const sources = [...new Set(SEEDS.map((s) => s.source ?? ""))].filter(Boolean).sort();
  return {
    source: { kind: "demo", reason },
    generatedAt: new Date(now).toISOString(),
    todayStart: new Date(now - (now % DAY)).toISOString(),
    query,
    kpis: { onlineNow: 12, activeToday: 50, active7d: 201, sessionsToday: 84, highIntentActive: 11, pricingActivity: 13, nearFreeLimit: 9 },
    users,
    events: MOCK_EVENT_POOL.slice(0, 6).map((e, i) => ({ ...e, id: `mock-ev-${i}`, at: new Date(now - EVENT_AGES[i]!).toISOString() })),
    sessionBuckets: [
      { key: "lt2", label: "Under 2 min", count: 18 },
      { key: "2to5", label: "2 – 5 min", count: 24 },
      { key: "5to10", label: "5 – 10 min", count: 20 },
      { key: "10to20", label: "10 – 20 min", count: 15 },
      { key: "gt20", label: "20+ min", count: 7 },
    ],
    featureUsage: [
      { feature: "Job Feed", users: 12 },
      { feature: "Auto Apply", users: 9 },
      { feature: "Resume Analyzer", users: 7 },
      { feature: "Job Matching", users: 6 },
      { feature: "Pricing", users: 5 },
      { feature: "Profile", users: 4 },
      { feature: "Application Tracker", users: 3 },
    ],
    countryOptions,
    sourceOptions: sources.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })),
    planOptions: [
      { value: "FREE", label: "Free" },
      { value: "PRO", label: "Pro" },
      { value: "PREMIUM", label: "Premium" },
    ],
  };
}

// ----------------------------------------------------------------- sessions

const ROHIT_TIMELINE: [number, string, string, string | null][] = [
  // seconds after session start, event name, label, page
  [0, "login", "Login", "/"],
  [33, "page_view", "Job feed opened", "/jobs"],
  [69, "search_performed", "Search: Backend Developer", "/jobs"],
  [120, "job_viewed", "Viewed job at Amazon", "/jobs"],
  [201, "auto_apply_started", "Auto Apply started", "/jobs"],
  [257, "auto_apply_success", "Auto Apply submitted", "/jobs"],
  [339, "auto_apply_success", "Auto Apply submitted", "/jobs"],
  [421, "pricing_viewed", "Pricing opened", "/pricing"],
  [450, "premium_clicked", "Pro plan clicked", "/pricing"],
  [490, "page_view", "Returned to job feed", "/jobs"],
];

const MONETIZATION = new Set(["pricing_viewed", "plan_compared", "pro_clicked", "premium_clicked", "checkout_started", "payment_failed"]);

/** One demo user as a LiveUser, for dashboards that need a single profile. */
export function findMockLiveUser(userId: string, now = Date.now()): LiveUser | null {
  const s = SEEDS.find((x) => x.userId === userId);
  return s ? toUser(s, now) : null;
}

export function mockLiveSession(userId: string, now = Date.now()): LiveSession | null {
  const s = SEEDS.find((x) => x.userId === userId);
  if (!s) return null;
  const user = toUser(s, now);
  const start = user.sessionStartedAt ? Date.parse(user.sessionStartedAt) : now - s.seenAgo - 5 * MIN;
  const lastAt = Date.parse(user.lastSeenAt!);
  let steps: [number, string, string, string | null][];
  if (userId === "TJO-15103") {
    steps = ROHIT_TIMELINE;
  } else {
    const span = Math.max(60, (lastAt - start) / S);
    const action = currentAction(user);
    steps = [
      [0, "login", "Login", "/"],
      [span * 0.15, "page_view", "Job feed opened", "/jobs"],
      [span * 0.35, "search_performed", "Searched jobs", "/jobs"],
      [span * 0.6, "job_viewed", "Viewed 4 matching jobs", "/matches"],
      [span, s.lastEventName ?? "page_view", `${action.label} · ${lastEventLabel(s.lastEventName)}`, s.currentPage],
    ];
  }
  const scale = userId === "TJO-15103" ? Math.max(1, (lastAt - start) / S / 490) : 1;
  return {
    userId,
    sessionId: `mock-session-${userId}`,
    startedAt: new Date(start).toISOString(),
    isOnline: user.isOnline,
    sessionNumber: 3 + (Number(userId.replace(/\D/g, "")) % 17),
    device: userId.charCodeAt(userId.length - 1) % 3 === 0 ? "Mobile" : "Desktop",
    browser: userId.charCodeAt(userId.length - 1) % 2 === 0 ? "Chrome · Windows" : "Chrome · macOS",
    events: steps.map(([offset, eventName, label, page], i) => ({
      id: `${userId}-e${i}`,
      at: new Date(start + offset * scale * S).toISOString(),
      label,
      detail: page ? pageInfo(page).label : null,
      tone: MONETIZATION.has(eventName) ? "amber" : eventName.startsWith("auto_apply") ? "teal" : "green",
      eventName,
      page,
      properties: eventName === "search_performed" ? { query: "Backend Developer" } : eventName === "premium_clicked" ? { plan: "PRO", cycle: "MONTHLY" } : {},
      monetization: MONETIZATION.has(eventName),
    })),
  };
}

/** User 360 for demo live users, so "Open User 360" works in demo mode too. */
export function mockLiveUser360(userId: string, now = Date.now()): User360View | null {
  const s = SEEDS.find((x) => x.userId === userId);
  if (!s) return null;
  const user = toUser(s, now);
  const session = mockLiveSession(userId, now)!;
  const intent = pricingIntent(user);
  return {
    userId,
    displayId: user.displayId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    country: user.country,
    city: null,
    plan: user.plan,
    isPaid: user.isPaid,
    isOnline: user.isOnline,
    lifecycleStage: user.lifecycleStage,
    signupAt: user.signupAt,
    lastActiveAt: user.lastSeenAt,
    acquisition: { source: user.source, campaign: null },
    pql: {
      score: user.pqlScore,
      category: user.pqlScore >= 90 ? "buy_now" : user.pqlScore >= 75 ? "hot" : user.pqlScore >= 60 ? "warm" : "engaged",
      priority: user.priority,
      reason: INTENT_META[intent].rank >= 2 ? `${INTENT_META[intent].label} · ${user.autoAppliesUsed}/${user.autoApplyLimit} Auto Applies used` : null,
      nextBestAction: user.nextBestAction,
      reasons: [
        ...(user.autoAppliesUsed >= 45 ? [{ label: "45 free applies used", points: 10 }] : []),
        ...(user.planClicks30d > 0 ? [{ label: "Plan clicked", points: 12 }] : []),
        ...(user.pricingViews30d > 0 ? [{ label: "Pricing viewed", points: 8 }] : []),
        { label: "Resume uploaded", points: 5 },
      ],
    },
    autoApply: { used: user.autoAppliesUsed, limit: user.autoApplyLimit, successful: user.autoAppliesUsed - user.autoApplyFailures7d, failed: user.autoApplyFailures7d },
    intent: { pricingViews: user.pricingViews30d, planClicks: user.planClicks30d, checkoutsStarted: user.checkoutStarted30d, checkoutsAbandoned: user.checkoutAbandoned ? 1 : 0 },
    session: { startedAt: session.startedAt, durationSeconds: Math.round((Date.parse(user.lastSeenAt!) - Date.parse(session.startedAt)) / S), device: session.device, isCurrent: user.isOnline },
    activity: [...session.events].reverse().map(({ id, at, label, detail, tone }) => ({ id, at, label, detail, tone })),
    sales: { leadId: user.ownerId ? `lead-${userId}` : null, leadStatus: user.ownerId ? "contacted" : null, ownerId: user.ownerId, ownerName: user.ownerName, lastContactAt: null, contacts: [] },
    team: [
      { value: "mock-rahul", label: "Rahul Kumar" },
      { value: "mock-sneha", label: "Sneha Patel" },
      { value: "mock-amit", label: "Amit Singh" },
    ],
  };
}
