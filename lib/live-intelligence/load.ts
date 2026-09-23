import "server-only";
import { queryRows } from "@/lib/db/pool";
import { liveEvents, liveSummary } from "@/lib/dashboards/live";
import { applyPii } from "@/lib/pii";
import { countryName } from "@/lib/revenue-center/format";
import { checkAvailability } from "@/lib/revenue-center/load";
import { businessToday, startOfBusinessDate } from "@/lib/time/business-time";
import { FEATURES, pageInfo } from "@/lib/live-intelligence/derive";
import { mockLiveIntelligence } from "@/lib/live-intelligence/mock";
import type { EventCategory, LiveEvent, LiveIntelligenceData, LiveUser } from "@/lib/live-intelligence/types";
import { USER_SUMMARY_COLUMNS, USER_SUMMARY_JOINS, type UserSummaryRow } from "@/lib/users/summary";

// ---------------------------------------------------------------------------
// Live User Intelligence loader. Reads derived tables only (presence cache,
// sessions, pql_scores facts snapshot, lifecycle); the event stream reuses
// liveEvents(). Falls back to labelled demo data like the Revenue Command Center.
// ---------------------------------------------------------------------------

const MAX_USERS = 300;

export async function loadLiveIntelligence(query: string): Promise<LiveIntelligenceData> {
  const availability = await checkAvailability();
  let data: LiveIntelligenceData;
  if (!availability.ok) data = mockLiveIntelligence(query, availability.reason);
  else {
    try {
      data = await loadLive(query);
    } catch (err) {
      console.error("[live-intelligence] live load failed, using demo data", err);
      data = mockLiveIntelligence(query, "Live data failed to load — showing demo data.");
    }
  }
  return { ...data, todayStart: businessTodayStart() };
}

/** Start of the business day; UTC midnight if the environment is not configured. */
function businessTodayStart(): string {
  try {
    return startOfBusinessDate(businessToday()).toISOString();
  } catch {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
}

interface UserRow extends UserSummaryRow {
  signup_at: Date | null;
  session_started_at: Date | null;
  owner_id: string | null;
  facts: {
    pricingViews30d?: number;
    planClicks30d?: number;
    checkoutStarted30d?: number;
    checkoutAbandoned7d?: boolean;
    paymentFailedUnresolved?: boolean;
    autoApplyFailed7d?: number;
  } | null;
  seen_at: Date | null;
}

async function loadLive(query: string): Promise<LiveIntelligenceData> {
  const [summary, users, buckets, features, events, resurrections, options] = await Promise.all([
    liveSummary({}),
    loadUsers(query),
    sessionBuckets(),
    featureUsage(),
    liveEvents({ importance: "low", limit: 40, eventNames: Object.keys(EVENT_COPY) }),
    queryRows<{ user_id: string; transitioned_at: Date }>(
      `SELECT user_id, transitioned_at FROM lifecycle_history
       WHERE to_stage = 'resurrected' AND transitioned_at > now() - interval '7 days'
       ORDER BY transitioned_at DESC LIMIT 10`
    ),
    filterOptions(),
  ]);

  const stream: LiveEvent[] = [
    ...mapEvents(events.data),
    ...resurrections.map((r) => ({
      id: `resurrected:${r.user_id}:${r.transitioned_at.toISOString()}`,
      userId: r.user_id,
      displayId: r.user_id,
      text: "returned after a dormant period",
      category: "retention" as const,
      at: r.transitioned_at.toISOString(),
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 20);

  return {
    source: { kind: "live" },
    generatedAt: new Date().toISOString(),
    todayStart: "",
    query,
    kpis: {
      onlineNow: summary.online_now ?? 0,
      activeToday: summary.active_today ?? 0,
      active7d: summary.active_7d ?? 0,
      sessionsToday: summary.sessions_today ?? 0,
      highIntentActive: summary.high_intent_active ?? 0,
      pricingActivity: summary.pricing_activity ?? 0,
      nearFreeLimit: summary.near_free_limit ?? 0,
    },
    users,
    events: stream,
    sessionBuckets: buckets,
    featureUsage: features,
    ...options,
  };
}

async function loadUsers(query: string): Promise<LiveUser[]> {
  const params: unknown[] = [MAX_USERS];
  let search = "";
  const q = query.trim();
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    search = ` AND (u.user_id ILIKE $2 OR u.name ILIKE $2 OR u.email ILIKE $2`;
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      search += ` OR regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE $3`;
    }
    search += ")";
  }
  const rows = await queryRows<UserRow>(
    `SELECT ${USER_SUMMARY_COLUMNS}, u.signup_at, lead.owner_id, ps.facts,
            cs.started_at AS session_started_at,
            COALESCE(pr.last_seen_at, u.last_active_at) AS seen_at
     FROM users u ${USER_SUMMARY_JOINS}
     LEFT JOIN user_sessions cs ON cs.session_id = pr.current_session_id
     WHERE COALESCE(pr.last_seen_at, u.last_active_at) > now() - interval '7 days'${search}
     ORDER BY is_online DESC, ps.priority ASC NULLS LAST, COALESCE(ps.score, 0) DESC, seen_at DESC NULLS LAST
     LIMIT $1`,
    params
  );

  return rows.map((r) => {
    const f = r.facts ?? {};
    const pii = applyPii({ email: r.email, phone: r.phone }, false);
    return {
      userId: r.user_id,
      displayId: r.user_id,
      name: r.name ?? r.user_id,
      email: pii.email,
      phone: pii.phone,
      country: r.country,
      plan: r.plan,
      isPaid: r.is_paid,
      source: r.acq_source?.toLowerCase() ?? null,
      lifecycleStage: r.lifecycle_stage,
      signupAt: r.signup_at?.toISOString() ?? null,
      isOnline: r.is_online,
      lastSeenAt: r.seen_at?.toISOString() ?? null,
      currentPage: r.current_page,
      lastEventName: r.last_event_name,
      sessionStartedAt: r.session_started_at?.toISOString() ?? null,
      autoAppliesUsed: r.auto_apply_used,
      autoApplyLimit: r.auto_apply_limit,
      autoApplyFailures7d: f.autoApplyFailed7d ?? 0,
      pricingViews30d: f.pricingViews30d ?? 0,
      planClicks30d: f.planClicks30d ?? 0,
      checkoutStarted30d: f.checkoutStarted30d ?? 0,
      checkoutAbandoned: f.checkoutAbandoned7d ?? false,
      paymentFailed: f.paymentFailedUnresolved ?? false,
      lastPremiumClick: r.last_event_name === "premium_clicked",
      pqlScore: r.pql_score,
      priority: r.priority as LiveUser["priority"],
      nextBestAction: r.next_best_action,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
    };
  });
}

async function sessionBuckets() {
  const rows = await queryRows<Record<string, number>>(
    `WITH s AS (
       SELECT CASE WHEN ended_at IS NULL THEN extract(epoch FROM now() - started_at) ELSE duration_seconds END AS secs
       FROM user_sessions WHERE started_at >= business_day_start(business_today())
     )
     SELECT count(*) FILTER (WHERE secs < 120)::int AS lt2,
            count(*) FILTER (WHERE secs >= 120 AND secs < 300)::int AS "2to5",
            count(*) FILTER (WHERE secs >= 300 AND secs < 600)::int AS "5to10",
            count(*) FILTER (WHERE secs >= 600 AND secs < 1200)::int AS "10to20",
            count(*) FILTER (WHERE secs >= 1200)::int AS gt20
     FROM s`
  );
  const r = rows[0] ?? {};
  return [
    { key: "lt2", label: "Under 2 min", count: r.lt2 ?? 0 },
    { key: "2to5", label: "2 – 5 min", count: r["2to5"] ?? 0 },
    { key: "5to10", label: "5 – 10 min", count: r["5to10"] ?? 0 },
    { key: "10to20", label: "10 – 20 min", count: r["10to20"] ?? 0 },
    { key: "gt20", label: "20+ min", count: r.gt20 ?? 0 },
  ];
}

/** Users on each product area now: presence seen in the last 30 minutes, by current page. */
async function featureUsage() {
  const rows = await queryRows<{ current_page: string | null; users: number }>(
    `SELECT current_page, count(*)::int AS users FROM user_presence
     WHERE last_seen_at > now() - interval '30 minutes' GROUP BY current_page`
  );
  const counts = new Map<string, number>(FEATURES.map((f) => [f, 0]));
  for (const r of rows) {
    const feature = pageInfo(r.current_page).feature;
    if (feature) counts.set(feature, (counts.get(feature) ?? 0) + r.users);
  }
  return [...counts.entries()].map(([feature, users]) => ({ feature, users })).sort((a, b) => b.users - a.users);
}

type StreamRow = Awaited<ReturnType<typeof liveEvents>>["data"][number];

const EVENT_COPY: Record<string, (p: Record<string, unknown>) => { text: string; category: EventCategory } | null> = {
  auto_apply_milestone: (p) => ({ text: `reached ${p.used ?? p.milestone}/50 free Auto Applies`, category: "opportunity" }),
  pro_clicked: () => ({ text: "clicked Pro plan", category: "high_intent" }),
  premium_clicked: () => ({ text: "clicked Premium plan", category: "high_intent" }),
  plan_compared: () => ({ text: "compared plans", category: "high_intent" }),
  pricing_viewed: () => ({ text: "viewed pricing", category: "high_intent" }),
  checkout_started: (p) => ({ text: `started checkout${p.plan ? ` (${String(p.plan).toLowerCase()})` : ""}`, category: "high_intent" }),
  checkout_abandoned: () => ({ text: "abandoned checkout", category: "revenue_recovery" }),
  payment_success: () => ({ text: "completed checkout", category: "conversion" }),
  subscription_started: (p) => ({ text: `started a ${p.plan ? String(p.plan).toLowerCase() + " " : ""}subscription`, category: "conversion" }),
  payment_failed: () => ({ text: "payment failed", category: "revenue_recovery" }),
  subscription_cancelled: () => ({ text: "cancelled subscription", category: "revenue_recovery" }),
  auto_apply_failed: () => ({ text: "experienced an Auto Apply failure", category: "product_issue" }),
  auto_apply_blocked: () => ({ text: "was blocked by the free Auto Apply limit", category: "opportunity" }),
  resume_uploaded: () => ({ text: "uploaded a resume", category: "activation" }),
  signup_completed: () => ({ text: "completed signup", category: "activation" }),
  onboarding_completed: () => ({ text: "completed onboarding", category: "activation" }),
  error_shown: () => ({ text: "hit an error", category: "product_issue" }),
  resume_parse_failed: () => ({ text: "resume could not be parsed", category: "product_issue" }),
};

function mapEvents(rows: StreamRow[]): LiveEvent[] {
  const out: LiveEvent[] = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    const copy = EVENT_COPY[r.event_name]?.(r.properties ?? {});
    if (!copy || !r.user_id) continue;
    // Browser and server both report some events (checkout_started): show one.
    const key = `${r.user_id}:${r.event_name}`;
    const at = new Date(r.occurred_at).getTime();
    if (seen.has(key) && Math.abs(seen.get(key)! - at) < 5 * 60_000) continue;
    seen.set(key, at);
    out.push({ id: r.event_id, userId: r.user_id, displayId: r.user_id, text: copy.text, category: copy.category, at: new Date(at).toISOString() });
  }
  return out;
}

async function filterOptions() {
  const [countries, sources, plans] = await Promise.all([
    queryRows<{ v: string }>("SELECT DISTINCT country AS v FROM users WHERE country IS NOT NULL ORDER BY 1"),
    queryRows<{ v: string }>("SELECT DISTINCT lower(acq_source) AS v FROM users WHERE acq_source IS NOT NULL ORDER BY 1"),
    queryRows<{ v: string }>("SELECT DISTINCT plan AS v FROM users ORDER BY 1"),
  ]);
  const title = (s: string) => s[0]!.toUpperCase() + s.slice(1).toLowerCase();
  return {
    countryOptions: countries.map((c) => ({ value: c.v, label: countryName(c.v) })),
    sourceOptions: sources.map((s) => ({ value: s.v, label: title(s.v) })),
    planOptions: plans.map((p) => ({ value: p.v, label: title(p.v) })),
  };
}
