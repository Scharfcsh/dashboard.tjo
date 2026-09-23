import { formatDuration } from "@/lib/revenue-center/format";
import type { IconKey, Tone } from "@/lib/revenue-center/types";
import {
  isManagerRole,
  pipelineStageTone,
  pitchFor,
  pricingIntent,
  queuedBecause,
  roleLabel,
  statusPresentation,
} from "@/lib/sales-crm/derive";
import type {
  CallNextLead,
  FollowUp,
  LeadActivity,
  LeadDetail,
  LeadPriority,
  LeaderboardRow,
  PoolSegment,
  QueueLead,
  SalesCrmData,
  SalesFilters,
  SalesKpi,
  SlaMetric,
} from "@/lib/sales-crm/types";

// ---------------------------------------------------------------------------
// Demo dataset for the Sales Caller CRM - the approved reference, made
// internally consistent: the pipeline sums to the queue, the pitch is derived
// by the same function the live loader uses, and every relative time is
// computed from real "now" so "7 minutes ago" stays true tomorrow.
//
// This runs only on the server, so the client receives fixed strings.
// ---------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const CALLERS: { id: string; name: string; role: string }[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Rahul Sharma", role: "caller" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Sneha Iyer", role: "caller" },
  { id: "00000000-0000-4000-8000-000000000003", name: "Amit Verma", role: "sales_manager" },
  { id: "00000000-0000-4000-8000-000000000004", name: "Neha Gupta", role: "caller" },
];

interface SeedLead {
  leadId: string;
  userId: string;
  name: string;
  priority: LeadPriority;
  score: number;
  reason: string;
  used: number;
  pricingViews: number;
  planClicked: boolean;
  checkoutStarted: boolean;
  checkoutAbandoned: boolean;
  paymentFailed: boolean;
  status: string;
  lastActiveMinutes: number;
  lastContactHours: number | null;
  country: string;
  role: string;
  city: string;
  pendingDisposition?: boolean;
  callbackInMinutes?: number;
}

const uuid = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;

const SEED_LEADS: SeedLead[] = [
  { leadId: uuid(1), userId: "TJO-14882", name: "Vishal Sharma", priority: "P0", score: 96, reason: "47/50 free Auto Applies used + pricing viewed 4 times", used: 47, pricingViews: 4, planClicked: true, checkoutStarted: true, checkoutAbandoned: false, paymentFailed: false, status: "new", lastActiveMinutes: 7, lastContactHours: null, country: "IN", role: "Software Engineer", city: "Bengaluru" },
  { leadId: uuid(2), userId: "TJO-14630", name: "John Davis", priority: "P0", score: 94, reason: "Checkout abandoned after selecting Premium", used: 44, pricingViews: 6, planClicked: true, checkoutStarted: true, checkoutAbandoned: true, paymentFailed: false, status: "contacted", lastActiveMinutes: 12, lastContactHours: 20, country: "US", role: "Data Analyst", city: "Austin" },
  { leadId: uuid(3), userId: "TJO-14761", name: "Priya Mehta", priority: "P1", score: 87, reason: "45+ applications used, steady weekly activity", used: 46, pricingViews: 2, planClicked: false, checkoutStarted: false, checkoutAbandoned: false, paymentFailed: false, status: "new", lastActiveMinutes: 62, lastContactHours: null, country: "IN", role: "Product Manager", city: "Pune", callbackInMinutes: 95 },
  { leadId: uuid(4), userId: "TJO-15217", name: "Emily Carter", priority: "P1", score: 82, reason: "Clicked the Pro plan twice this week", used: 31, pricingViews: 3, planClicked: true, checkoutStarted: false, checkoutAbandoned: false, paymentFailed: false, status: "callback", lastActiveMinutes: 20, lastContactHours: 48, country: "US", role: "QA Engineer", city: "Denver", callbackInMinutes: 210 },
  { leadId: uuid(5), userId: "TJO-14831", name: "Aditya Verma", priority: "P2", score: 61, reason: "New active user, completed onboarding", used: 9, pricingViews: 1, planClicked: false, checkoutStarted: false, checkoutAbandoned: false, paymentFailed: false, status: "new", lastActiveMinutes: 35, lastContactHours: null, country: "IN", role: "DevOps Engineer", city: "Hyderabad", callbackInMinutes: 285 },
  { leadId: uuid(6), userId: "TJO-15044", name: "Rohit Singh", priority: "P0", score: 92, reason: "Free quota exhausted, checkout started but not paid", used: 50, pricingViews: 6, planClicked: true, checkoutStarted: true, checkoutAbandoned: false, paymentFailed: false, status: "contacted", lastActiveMinutes: 14, lastContactHours: 3, country: "IN", role: "Software Engineer", city: "Bengaluru", pendingDisposition: true },
  { leadId: uuid(7), userId: "TJO-14310", name: "Meera Nair", priority: "P0", score: 90, reason: "Payment failed on the Premium plan", used: 50, pricingViews: 3, planClicked: true, checkoutStarted: true, checkoutAbandoned: false, paymentFailed: true, status: "new", lastActiveMinutes: 34, lastContactHours: null, country: "IN", role: "Business Analyst", city: "Kochi" },
  { leadId: uuid(8), userId: "TJO-15220", name: "Daniel Brooks", priority: "P1", score: 69, reason: "Crossed 40 applications this week", used: 44, pricingViews: 1, planClicked: false, checkoutStarted: false, checkoutAbandoned: false, paymentFailed: false, status: "contacted", lastActiveMinutes: 140, lastContactHours: 26, country: "US", role: "Marketing Associate", city: "Chicago" },
  { leadId: uuid(9), userId: "TJO-14988", name: "Fatima Ali", priority: "P1", score: 74, reason: "Plan clicked while nearing the free limit", used: 47, pricingViews: 2, planClicked: true, checkoutStarted: false, checkoutAbandoned: false, paymentFailed: false, status: "interested", lastActiveMinutes: 26, lastContactHours: 5, country: "AE", role: "Software Engineer", city: "Dubai" },
  { leadId: uuid(10), userId: "TJO-15188", name: "Karan Patel", priority: "P1", score: 83, reason: "Abandoned checkout on the Premium plan", used: 49, pricingViews: 4, planClicked: true, checkoutStarted: true, checkoutAbandoned: true, paymentFailed: false, status: "contacted", lastActiveMinutes: 51, lastContactHours: 8, country: "IN", role: "Full Stack Developer", city: "Ahmedabad" },
  { leadId: uuid(11), userId: "TJO-15301", name: "Grace Wilson", priority: "P2", score: 58, reason: "Engaged but has not looked at pricing", used: 38, pricingViews: 0, planClicked: false, checkoutStarted: false, checkoutAbandoned: false, paymentFailed: false, status: "new", lastActiveMinutes: 410, lastContactHours: null, country: "GB", role: "Recruiter", city: "Manchester" },
  { leadId: uuid(12), userId: "TJO-14655", name: "Arjun Kapoor", priority: "P2", score: 55, reason: "Returned after a week away", used: 41, pricingViews: 0, planClicked: false, checkoutStarted: false, checkoutAbandoned: false, paymentFailed: false, status: "new", lastActiveMinutes: 320, lastContactHours: null, country: "IN", role: "Data Engineer", city: "Chennai" },
];

function mapSeed(l: SeedLead, nowMs: number): QueueLead {
  const status = statusPresentation(l.status);
  return {
    leadId: l.leadId,
    userId: l.userId,
    name: l.name,
    priority: l.priority,
    pqlScore: l.score,
    reason: l.reason,
    autoApplyUsed: l.used,
    autoApplyLimit: 50,
    pricingIntent: pricingIntent(l.pricingViews, l.checkoutStarted, l.planClicked),
    pricingViews: l.pricingViews,
    lastActiveAt: new Date(nowMs - l.lastActiveMinutes * MINUTE).toISOString(),
    lastContactAt: l.lastContactHours === null ? null : new Date(nowMs - l.lastContactHours * HOUR).toISOString(),
    statusLabel: status.label,
    statusTone: status.tone,
    nextAction: l.status === "callback" ? "whatsapp" : "call",
    slaDueAt: new Date(nowMs + 9 * MINUTE).toISOString(),
    slaBreached: false,
    pendingDisposition: l.pendingDisposition ?? false,
    callbackDueAt: l.callbackInMinutes === undefined ? null : new Date(nowMs + l.callbackInMinutes * MINUTE).toISOString(),
    callbackIsDue: false,
    isOnline: l.lastActiveMinutes <= 5,
    country: l.country,
  };
}

function mapCallNext(l: SeedLead, nowMs: number): CallNextLead {
  const base = mapSeed(l, nowMs);
  const planInterest = l.planClicked ? "Pro" : null;
  return {
    ...base,
    role: l.role,
    city: l.city,
    planInterest,
    checkoutLabel: l.checkoutAbandoned
      ? "Abandoned"
      : l.checkoutStarted
        ? "Started once"
        : l.planClicked
          ? "Plan selected"
          : "Not started",
    freeApplicationsLeft: Math.max(0, 50 - l.used),
    pitch: pitchFor({
      firstName: l.name.split(" ")[0]!,
      used: l.used,
      limit: 50,
      pricingViews: l.pricingViews,
      planInterest,
      checkoutStarted: l.checkoutStarted,
      paymentFailed: l.paymentFailed,
    }),
    why: [
      `${l.used}/50 free applications used (${Math.max(0, 50 - l.used)} left)`,
      `Viewed the pricing page ${l.pricingViews} times`,
      l.checkoutStarted ? "Started checkout once" : "Has not started checkout",
      "Active user — multiple sessions this week",
      planInterest ? `High intent for the ${planInterest} plan` : "No plan selected yet",
    ],
    queuedBecause: queuedBecause(base),
  };
}

const KPI_SPEC: [string, string, number, IconKey, Tone, string | null, Tone | null, string][] = [
  ["assigned", "Assigned Today", 22, "users", "blue", "+4 vs yesterday", "teal", "Leads created for you inside the selected range."],
  ["call_now", "Call Immediately", 6, "alert", "red", "P0 priority", "red", "Open P0 leads in your queue right now."],
  ["pending", "Pending", 12, "calendar", "amber", "Need outreach", null, "Open leads you have never contacted."],
  ["callbacks", "Callbacks", 4, "refresh", "purple", "Scheduled", null, "Pending callbacks you own, due before the end of today."],
  ["connected", "Connected", 8, "user-check", "teal", "36% connected", "teal", "Distinct leads whose call connected inside the range."],
  ["converted", "Converted", 2, "check-circle", "green", "+1 vs yesterday", "green", "Leads you closed as converted inside the range."],
  ["revenue", "Revenue", 1118, "wallet", "teal", null, null, "Successful payments inside the range by users whose lead you own, made after the lead was created."],
];

const POOL: { key: string; label: string; action: string; users: number; tone: Tone }[] = [
  { key: "hot", label: "Hot", action: "Call first", users: 9, tone: "red" },
  { key: "warm", label: "Warm", action: "Call today", users: 14, tone: "amber" },
  { key: "engaged", label: "Engaged", action: "Nurture", users: 17, tone: "blue" },
  { key: "new_early", label: "New / Early", action: "Activation support", users: 7, tone: "purple" },
  { key: "product_issue", label: "Product Issue", action: "Support before selling", users: 3, tone: "slate" },
];

const PIPELINE: { key: string; label: string; leads: number }[] = [
  { key: "new_lead", label: "New Lead", leads: 12 },
  { key: "contacted", label: "Contacted", leads: 18 },
  { key: "connected", label: "Connected", leads: 8 },
  { key: "interested", label: "Interested", leads: 6 },
  { key: "follow_up", label: "Follow-Up", leads: 4 },
  { key: "payment_link", label: "Payment Link", leads: 3 },
  { key: "converted", label: "Converted", leads: 2 },
];

const LEADERBOARD: [number, number, number, number, number, number, number][] = [
  // name index, leads, calls, connections, interested, conversions, revenue
  [0, 22, 18, 8, 5, 2, 1118],
  [1, 18, 15, 6, 4, 1, 559],
  [2, 16, 12, 4, 3, 1, 399],
  [3, 14, 11, 4, 2, 1, 299],
];

const SLA: SlaMetric[] = [
  { key: "first_response", label: "Average first response", value: "11m", target: "Target < 30m", tone: "green", callToAction: null },
  { key: "p0_sla", label: "P0 within 15m", value: "82%", target: "Target 80%", tone: "green", callToAction: null },
  { key: "overdue_p0", label: "Overdue P0 leads", value: "2", target: null, tone: "red", callToAction: "Needs attention" },
  { key: "unassigned_hot", label: "Unassigned hot leads", value: "3", target: null, tone: "red", callToAction: "Assign now" },
];

function activities(nowMs: number): LeadActivity[] {
  return [
    { id: "a1", type: "call", summary: "Call — connected", detail: "Walked through how Auto Apply is going. Asked about the free limit.", actorName: "Rahul Sharma", at: new Date(nowMs - 3 * HOUR).toISOString(), durationSeconds: 214 },
    { id: "a2", type: "disposition", summary: "Outcome — interested", detail: "Wants to compare Pro and Premium before deciding.", actorName: "Rahul Sharma", at: new Date(nowMs - 3 * HOUR + 4 * MINUTE).toISOString(), durationSeconds: null },
    { id: "a3", type: "whatsapp", summary: "WhatsApp — sent", detail: "Sent the plan comparison link.", actorName: "Rahul Sharma", at: new Date(nowMs - 2 * HOUR).toISOString(), durationSeconds: null },
    { id: "a4", type: "call", summary: "Call — no answer", detail: null, actorName: "Sneha Iyer", at: new Date(nowMs - 1 * DAY).toISOString(), durationSeconds: null },
  ];
}

function notes(nowMs: number): LeadActivity[] {
  return [
    { id: "n1", type: "note", summary: "Note", detail: "Prefers a call after 6 PM IST. Works at a startup, hiring season is busy.", actorName: "Rahul Sharma", at: new Date(nowMs - 4 * HOUR).toISOString(), durationSeconds: null },
    { id: "n2", type: "note", summary: "Note", detail: "Mentioned a colleague also wants an account — possible second sale.", actorName: "Rahul Sharma", at: new Date(nowMs - 2 * DAY).toISOString(), durationSeconds: null },
  ];
}

function detailFor(seed: SeedLead, nowMs: number): LeadDetail {
  const used = seed.used;
  const status = statusPresentation(seed.status);
  const call = mapCallNext(seed, nowMs);
  return {
    leadId: seed.leadId,
    userId: seed.userId,
    name: seed.name,
    emailMasked: `${seed.name.split(" ")[0]!.toLowerCase()}*******@gmail.com`,
    phoneMasked: "+91 98******10",
    role: seed.role,
    location: `${seed.city}, ${seed.country === "IN" ? "India" : seed.country === "US" ? "USA" : seed.country === "AE" ? "UAE" : "UK"}`,
    joinedAt: new Date(nowMs - 240 * DAY).toISOString(),
    lastActiveAt: new Date(nowMs - seed.lastActiveMinutes * MINUTE).toISOString(),
    isOnline: seed.lastActiveMinutes <= 5,
    priority: seed.priority,
    pqlScore: seed.score,
    statusLabel: status.label,
    whyHot: call.why,
    usage: [
      { label: "Auto Apply", value: `${used}/50`, bar: { used, limit: 50 } },
      { label: "Total applications", value: "183" },
      { label: "Last session", value: `${seed.lastActiveMinutes} minutes ago` },
      { label: "Top activity", value: "Job search, Auto Apply" },
    ],
    pricing: [
      { label: "Pricing pages viewed", value: `${seed.pricingViews} times` },
      { label: "Plan clicked", value: seed.planClicked ? "Pro" : "Never" },
      { label: "Checkout", value: call.checkoutLabel },
      { label: "Payment", value: seed.paymentFailed ? "Last attempt failed" : "No failures" },
    ],
    sessions: [
      { id: "s1", startedAt: new Date(nowMs - seed.lastActiveMinutes * MINUTE).toISOString(), summary: `18 events · ${formatDuration(640)} · desktop` },
      { id: "s2", startedAt: new Date(nowMs - 5 * HOUR).toISOString(), summary: `9 events · ${formatDuration(320)} · desktop` },
      { id: "s3", startedAt: new Date(nowMs - 1 * DAY).toISOString(), summary: `26 events · ${formatDuration(1480)} · mobile` },
    ],
    activities: activities(nowMs),
    notes: notes(nowMs),
    pitch: call.pitch,
    nextAction: "call_now",
    nextActionLabel: "Call now and discuss upgrade",
    pendingDisposition: seed.pendingDisposition ?? false,
  };
}

export function mockSalesCrm(filters: SalesFilters, reason: string): SalesCrmData {
  const nowMs = Date.now();
  const selectedCaller = CALLERS.find((c) => c.id === filters.caller) ?? CALLERS[0]!;
  const isManager = isManagerRole(selectedCaller.role);

  const queue = SEED_LEADS.map((l) => mapSeed(l, nowMs));
  const callNextSeed = SEED_LEADS[0]!;
  const selectedSeed = SEED_LEADS.find((l) => l.leadId === filters.lead) ?? callNextSeed;

  const poolTotal = POOL.reduce((a, s) => a + s.users, 0);

  return {
    source: { kind: "demo", reason },
    generatedAt: new Date(nowMs - 45_000).toISOString(),
    filters,
    caller: {
      id: selectedCaller.id,
      name: selectedCaller.name,
      role: selectedCaller.role,
      roleLabel: roleLabel(selectedCaller.role),
      isManager,
      active: true,
      email: `${selectedCaller.name.split(" ")[0]!.toLowerCase()}@topjoboffer.com`,
    },
    callerOptions: CALLERS.map((c) => ({ value: c.id, label: c.name })),
    kpis: KPI_SPEC.map(
      ([key, label, value, icon, tone, caption, captionTone, definition]): SalesKpi => ({
        key,
        label,
        value,
        format: key === "revenue" ? "currency" : "number",
        icon,
        tone,
        caption,
        captionTone,
        definition,
      })
    ),
    poolSegments: POOL.map(
      (s): PoolSegment => ({ ...s, sharePct: Math.round((s.users / poolTotal) * 1000) / 10 })
    ),
    poolActiveUsers: poolTotal,
    callNext: mapCallNext(callNextSeed, nowMs),
    unassignedOpenLeads: 0,
    queue,
    queueTotal: 22,
    followUps: SEED_LEADS.filter((l) => l.callbackInMinutes !== undefined).map(
      (l): FollowUp => ({
        callbackId: `cb-${l.leadId}`,
        leadId: l.leadId,
        userId: l.userId,
        name: l.name,
        dueAt: new Date(nowMs + l.callbackInMinutes! * MINUTE).toISOString(),
        isDue: false,
        notes:
          l.name === "Priya Mehta"
            ? "Asked for a callback after office hours"
            : l.name === "Emily Carter"
              ? "Payment issue with her card"
              : "Wants a plan comparison",
        priority: l.priority,
        reason: l.reason,
      })
    ),
    pipeline: PIPELINE.map((s) => ({ ...s, tone: pipelineStageTone(s.key) })),
    pipelineTotal: PIPELINE.reduce((a, s) => a + s.leads, 0),
    selectedLead: detailFor(selectedSeed, nowMs),
    openAlerts: 3,
    leaderboard: isManager
      ? LEADERBOARD.map(([nameIndex, leads, calls, connections, interested, conversions, revenue]): LeaderboardRow => {
          const c = CALLERS[nameIndex]!;
          return {
            callerId: c.id,
            name: c.name,
            role: roleLabel(c.role),
            leads,
            calls,
            connections,
            interested,
            conversions,
            revenue,
            conversionRatePct: Math.round((conversions / leads) * 1000) / 10,
            isSelf: c.id === selectedCaller.id,
          };
        })
      : [],
    sla: isManager ? SLA : [],
  };
}

