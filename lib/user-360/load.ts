import "server-only";
import { queryRows } from "@/lib/db/pool";
import { salesActivities, user360, userSessions } from "@/lib/dashboards/user360";
import { ApiError } from "@/lib/http/errors";
import { humanize } from "@/lib/revenue-center/format";
import { checkAvailability } from "@/lib/revenue-center/load";
import { eventCategory, intentJourney, MONETIZATION_EVENTS, reassurances, recommendedPlan, splitSignals, trendPct } from "@/lib/user-360/derive";
import { mockUserProfile } from "@/lib/user-360/mock";
import { loadApplications, loadExtras, loadRawEvents, loadTrends } from "@/lib/user-360/queries";
import type { HealthItem, ProfileMetric, SalesActivityEntry, SessionCard, UsageItem, UserProfileData } from "@/lib/user-360/types";

// ---------------------------------------------------------------------------
// User 360 profile loader: the /api/users/:id/360 data plus applications,
// trends, devices and raw events, mapped to the page view-model. Falls back to
// clearly labelled demo data, like the other dashboards.
// ---------------------------------------------------------------------------

export async function loadUserProfile(userId: string): Promise<UserProfileData | null> {
  const availability = await checkAvailability();
  if (!availability.ok) return mockUserProfile(userId, availability.reason);
  try {
    return await loadLive(userId);
  } catch (err) {
    if (err instanceof ApiError && err.code === "NOT_FOUND") return null;
    console.error("[user-360] live load failed, using demo data", err);
    return mockUserProfile(userId, "Live data failed to load — showing demo data.");
  }
}

type Profile360 = Awaited<ReturnType<typeof user360>>["data"];

const num = (v: unknown) => Number(v ?? 0);

async function loadLive(userId: string): Promise<UserProfileData> {
  const profile = await user360(userId, false);
  const d: Profile360 = profile.data;

  const [sessionsPage, activities, applications, trends, extras, raw, team] = await Promise.all([
    userSessions(userId, { limit: 8 }, true),
    salesActivities(userId, { limit: 12 }),
    loadApplications(userId),
    loadTrends(userId),
    loadExtras(userId),
    loadRawEvents(userId),
    queryRows<{ id: string; name: string }>("SELECT id, name FROM team_members WHERE active ORDER BY name"),
  ]);

  const usage = d.product_usage;
  const auto = usage.auto_apply;
  const intent = d.subscription.purchase_intent;
  const payments = d.subscription.payments;
  const pql = d.pql;
  const lead = d.sales.open_lead as
    | { id: string; status: string; owner_id: string | null; owner_name: string | null; last_contacted_at: Date | null; created_at: Date; sla_due_at: Date | null }
    | null;
  const counts = d.sales.activity_counts as Record<string, { count: number; last_at: Date }>;
  const preferences = (d.profile.preferences ?? {}) as Record<string, unknown>;
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

  const usedPct = auto.limit === 0 ? 0 : Math.round((auto.used / auto.limit) * 100);
  const metrics: ProfileMetric[] = [
    {
      key: "sessions",
      label: "Sessions",
      value: String(usage.sessions_total),
      icon: "activity",
      tone: "blue",
      trendPct: trendPct(trends.current.sessions, trends.previous.sessions),
      secondary: "vs last 30 days",
      bar: null,
      definition: "Browser sessions; 30 idle minutes ends one.",
    },
    {
      key: "active_days",
      label: "Active Days",
      value: String(usage.active_days_total),
      icon: "calendar",
      tone: "purple",
      trendPct: trendPct(trends.current.active_days, trends.previous.active_days),
      secondary: `${usage.active_days_30d} in last 30 days`,
      bar: null,
      definition: "Days with at least one meaningful product action.",
    },
    { key: "jobs_viewed", label: "Jobs Viewed", value: String(usage.jobs_viewed), icon: "eye", tone: "teal", trendPct: trendPct(trends.current.jobs_viewed, trends.previous.jobs_viewed), secondary: null, bar: null, definition: "job_viewed events, all time." },
    { key: "jobs_saved", label: "Saved Jobs", value: String(usage.jobs_saved), icon: "file", tone: "amber", trendPct: trendPct(trends.current.jobs_saved, trends.previous.jobs_saved), secondary: null, bar: null, definition: "job_saved events, all time." },
    { key: "apply_clicks", label: "Apply Clicks", value: String(usage.apply_clicks), icon: "target", tone: "blue", trendPct: trendPct(trends.current.apply_clicks, trends.previous.apply_clicks), secondary: null, bar: null, definition: "Manual apply clicks (Auto Apply is counted separately)." },
    { key: "auto_applies", label: "Auto Applies", value: `${auto.used}/${auto.limit}`, icon: "zap", tone: "teal", trendPct: null, secondary: `${usedPct}% used`, bar: { used: auto.used, limit: auto.limit }, definition: "Free Auto Apply allowance consumed (auto_apply_usage)." },
    { key: "successful", label: "Successful", value: String(auto.successful), icon: "user-check", tone: "green", trendPct: trendPct(trends.current.auto_apply_success, trends.previous.auto_apply_success), secondary: auto.success_rate_pct === null ? null : `${auto.success_rate_pct}% success rate`, bar: null, definition: "Auto Apply runs that submitted an application." },
    { key: "failed", label: "Failed", value: String(auto.failed), icon: "x-circle", tone: "red", trendPct: trendPct(trends.current.auto_apply_failed, trends.previous.auto_apply_failed), secondary: auto.success_rate_pct === null ? null : `${Math.round((100 - auto.success_rate_pct) * 10) / 10}% failure rate`, bar: null, definition: "Auto Apply runs that failed." },
  ];

  const locations = preferences.locations ?? preferences.preferred_locations;
  const usageItems: UsageItem[] = [
    { label: "Resume uploaded", value: usage.resume_uploaded ? "Yes" : "No", icon: "file", progress: null, state: usage.resume_uploaded ? "yes" : "no" },
    {
      label: "Resume score",
      value: extras.resumeScore !== null ? `${extras.resumeScore}/100` : extras.resumeScoreTracked ? "—" : "Not tracked yet",
      icon: "gauge",
      progress: extras.resumeScore,
      state: "neutral",
    },
    { label: "Job profile created", value: d.profile.target_role ? "Yes" : "No", icon: "user-check", progress: null, state: d.profile.target_role ? "yes" : "no" },
    { label: "Target role", value: (d.profile.target_role as string | null) ?? "—", icon: "target", progress: null, state: "neutral" },
    { label: "Preferred locations", value: Array.isArray(locations) ? locations.join(", ") : ((locations as string | undefined) ?? "—"), icon: "users", progress: null, state: "neutral" },
    { label: "Matched jobs viewed", value: String(usage.jobs_viewed), icon: "eye", progress: null, state: "neutral" },
    { label: "AI resume tailoring uses", value: String(extras.tailoringUses), icon: "sparkles", progress: null, state: "neutral" },
    { label: "Cover letters generated", value: extras.coverLetters === null ? "Not tracked yet" : String(extras.coverLetters), icon: "file", progress: null, state: "neutral" },
    { label: "Auto Apply", value: `${auto.used}/${auto.limit}`, icon: "zap", progress: usedPct, state: "neutral" },
    { label: "Application success rate", value: auto.success_rate_pct === null ? "—" : `${auto.success_rate_pct}%`, icon: "target", progress: auto.success_rate_pct, state: "neutral" },
  ];

  const healthItems: HealthItem[] = [
    { label: `${extras.autoApplyFailuresLifetime} Auto Apply failures (lifetime)`, severity: extras.autoApplyFailuresLifetime > 0 ? "warn" : "ok" },
    { label: `${d.product_health.auto_apply_failures_7d} failures in last 7 days`, severity: d.product_health.auto_apply_failures_7d >= 3 ? "bad" : d.product_health.auto_apply_failures_7d > 0 ? "warn" : "ok" },
    { label: payments.failed > 0 ? `${payments.failed} payment failures` : "No payment failures", severity: payments.failed > 0 ? "bad" : "ok" },
    { label: "No support tickets", severity: "ok" },
    { label: extras.blocked > 0 ? `${extras.blocked} Auto Apply blocks` : "No account blocks", severity: extras.blocked > 0 ? "warn" : "ok" },
  ];
  const status = healthItems.some((i) => i.severity === "bad") ? "Needs attention" : "Healthy";

  type ApiSession = Awaited<ReturnType<typeof userSessions>>["data"][number];
  const sessions: SessionCard[] = (sessionsPage.data as ApiSession[]).map((s) => ({
    sessionId: s.session_id,
    startedAt: new Date(s.started_at).toISOString(),
    endedAt: s.ended_at ? new Date(s.ended_at).toISOString() : null,
    durationSeconds: s.duration_seconds,
    device: [s.device_type ? humanize(s.device_type) : null, s.browser].filter(Boolean).join(" · ") || null,
    isCurrent: s.is_current,
    eventCount: s.event_count,
    events: (s.events ?? []).map((e) => {
      const category = eventCategory(e.event_name);
      return {
        id: e.event_id,
        at: new Date(e.occurred_at).toISOString(),
        label: e.event_name === "page_view" && e.page ? `Opened ${e.page}` : e.label || humanize(e.event_name),
        category: category.label,
        tone: category.tone,
        outcome: e.event_name === "auto_apply_success" ? ("success" as const) : e.event_name === "auto_apply_failed" ? ("failed" as const) : null,
        monetization: MONETIZATION_EVENTS.has(e.event_name),
      };
    }),
  }));

  const reasons = (pql?.reasons ?? []) as { rule_id: string; label: string; points: number }[];
  const signals = splitSignals(reasons);
  const hasInactivity = reasons.some((r) => r.rule_id.startsWith("no_activity"));
  const salesActivityEntries: SalesActivityEntry[] = (
    activities.data as unknown as { id: string; type: string; outcome: string | null; disposition: string | null; body: string | null; actor_name: string | null; actor_id: string; occurred_at: Date }[]
  ).map((a) => ({
    id: a.id,
    type: a.type,
    summary: [humanize(a.type), a.outcome ? humanize(a.outcome) : null, a.disposition ? humanize(a.disposition) : null, a.body].filter(Boolean).join(" · "),
    actorName: a.actor_name ?? a.actor_id,
    at: new Date(a.occurred_at).toISOString(),
  }));

  return {
    source: { kind: "live" },
    generatedAt: new Date().toISOString(),
    user: {
      userId,
      displayId: userId,
      name: (d.identity.name as string | null) ?? userId,
      email: d.identity.email,
      phone: d.identity.phone,
      country: d.identity.country as string | null,
      city: d.identity.city as string | null,
      plan: String(d.identity.plan ?? "FREE"),
      isPaid: Boolean(d.identity.is_paid),
      isOnline: Boolean(d.identity.presence.is_online),
      lastActiveAt: iso(d.identity.last_active_at),
      signupAt: iso(d.identity.signup_at),
      targetRole: (d.profile.target_role as string | null) ?? null,
      experience: (d.profile.experience as string | null) ?? null,
      lifecycleStage: (d.lifecycle?.stage as string | undefined) ?? "new",
      pqlScore: num(pql?.score),
      pqlCategory: (pql?.category as string | undefined) ?? "early",
      priority: (pql?.priority as UserProfileData["user"]["priority"]) ?? null,
      priorityReason: (pql?.priority_reason as string | null) ?? null,
      nextBestAction: (pql?.next_best_action as string | null) ?? null,
      firstTouch: d.acquisition.source ? humanize(d.acquisition.source as string) : null,
      campaign: (d.acquisition.campaign as string | null) ?? null,
    },
    metrics,
    usage: usageItems,
    acquisition: [
      { label: "First Touch", value: d.acquisition.source ? humanize(d.acquisition.source as string) : null, icon: "sparkles" },
      { label: "Campaign", value: (d.acquisition.campaign as string | null) ?? null, icon: "flame" },
      { label: "Landing Page", value: (d.acquisition.landing_page as string | null) ?? null, icon: "eye", mono: true },
      { label: "UTM Source", value: (d.acquisition.source as string | null) ?? null, icon: "tag", mono: true },
      { label: "UTM Medium", value: (d.acquisition.medium as string | null) ?? null, icon: "tag", mono: true },
      { label: "UTM Campaign", value: (d.acquisition.campaign as string | null) ?? null, icon: "tag", mono: true },
      { label: "Signup Device", value: extras.signupDevice, icon: "users" },
      { label: "Current Device", value: extras.currentDevice, icon: "users" },
    ],
    health: { status, items: healthItems },
    sessions,
    intent: {
      steps: intentJourney({
        pricingViews: intent.pricing_views,
        proClicks: extras.proClicks,
        premiumClicks: extras.premiumClicks,
        checkoutsStarted: intent.checkouts_started,
        checkoutsAbandoned: intent.checkouts_abandoned,
        paymentAttempts: extras.paymentAttempts,
      }),
      recommendedPlan: recommendedPlan(extras.lastPlanClicked, Boolean(d.identity.is_paid), String(d.identity.plan ?? "FREE")),
      firstPricingViewAt: iso(intent.first_pricing_view_at),
      lastPricingViewDate: (intent.last_pricing_view_date as string | null) ?? null,
      subscriptions: (d.subscription.subscriptions as { subscription_id: string; plan: string | null; status: string; amount: number | null; started_at: Date | null }[]).map((s) => ({
        subscription_id: s.subscription_id,
        plan: s.plan,
        status: s.status,
        amount: s.amount,
        started_at: s.started_at ? new Date(s.started_at).toISOString() : null,
      })),
      payments: {
        successful: payments.successful,
        failed: payments.failed,
        lifetimeRevenue: payments.lifetime_revenue,
        lastSuccessAt: iso(payments.last_success_at),
        lastFailureAt: iso(payments.last_failure_at),
      },
    },
    pqlSignals: {
      positive: signals.positive,
      negative: [...signals.negative, ...reassurances(hasInactivity, payments.failed === 0)],
    },
    sales: {
      leadId: lead?.id ?? null,
      ownerId: lead?.owner_id ?? null,
      ownerName: lead?.owner_name ?? null,
      status: lead ? (lead.last_contacted_at ? humanize(lead.status) : "Uncontacted") : "No open lead",
      leadCreatedAt: lead ? new Date(lead.created_at).toISOString() : null,
      slaDueAt: lead?.sla_due_at ? new Date(lead.sla_due_at).toISOString() : null,
      lastContactAt: lead?.last_contacted_at ? new Date(lead.last_contacted_at).toISOString() : null,
      counts: {
        call: counts.call?.count ?? 0,
        whatsapp: counts.whatsapp?.count ?? 0,
        email: counts.email?.count ?? 0,
        note: counts.note?.count ?? 0,
      },
      pendingCallbacks: (d.sales.pending_callbacks as { id: string; due_at: Date; notes: string | null }[]).map((c) => ({
        id: c.id,
        due_at: new Date(c.due_at).toISOString(),
        notes: c.notes,
      })),
    },
    salesActivities: salesActivityEntries,
    applications,
    support: {
      status,
      autoApplyFailuresLifetime: extras.autoApplyFailuresLifetime,
      autoApplyFailures7d: d.product_health.auto_apply_failures_7d,
      paymentFailures: payments.failed,
      errors7d: extras.errors7d,
      blocked: extras.blocked,
      openAlerts: (d.sales.open_alerts as { id: string; title: string; priority: string; created_at: Date }[]).map((a) => ({
        id: a.id,
        title: a.title,
        priority: a.priority,
        created_at: new Date(a.created_at).toISOString(),
      })),
      ticketsConnected: false,
    },
    rawEvents: raw,
    team: team.map((t) => ({ value: t.id, label: t.name })),
  };
}
