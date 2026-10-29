import "server-only";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { queryOne, queryRows } from "@/lib/db/pool";
import {
  callbacksDue,
  callerKpis,
  callerLeaderboard,
  callerPipeline,
  leadById,
  leadPool,
  myLeads,
  nextLead,
  slaMetrics,
} from "@/lib/dashboards/sales";
import { salesActivities, userSessions } from "@/lib/dashboards/user360";
import { countryName, formatDuration, relativeTime } from "@/lib/revenue-center/format";
import { checkAvailability } from "@/lib/revenue-center/load";
import type { IconKey, Tone } from "@/lib/revenue-center/types";
import {
  formatResponseTime,
  isManagerRole,
  nextActionFor,
  pipelineStageTone,
  pitchFor,
  pricingIntent,
  queuedBecause,
  roleLabel,
  statusPresentation,
} from "@/lib/sales-crm/derive";
import { mockSalesCrm } from "@/lib/sales-crm/mock";
import type {
  CallNextLead,
  CallerIdentity,
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
import { parseRange } from "@/lib/time/business-time";

// ---------------------------------------------------------------------------
// Loads the Sales Caller CRM from the live analytics database - the same
// lib/dashboards/sales functions behind /api/sales/* - mapped to the view-model.
// Falls back to clearly labelled demo data when the database is unreachable.
//
// The workspace is scoped to one team member. A caller sees only their own
// queue; a sales manager works the whole team's leads, assigned or not, and
// additionally gets the team panels (SOP 12).
// ---------------------------------------------------------------------------

const QUEUE_PAGE = 25;

export async function loadSalesCrm(filters: SalesFilters): Promise<SalesCrmData> {
  const availability = await checkAvailability();
  if (!availability.ok) return mockSalesCrm(filters, availability.reason);
  try {
    return await loadLive(filters);
  } catch (err) {
    console.error("[sales-crm] live load failed, using demo data", err);
    return mockSalesCrm(filters, "Live data failed to load — showing demo data.");
  }
}

interface TeamRow {
  id: string;
  name: string;
  role: string;
  active: boolean;
  email: string | null;
}

async function loadLive(filters: SalesFilters): Promise<SalesCrmData> {
  const team = await queryRows<TeamRow>(
    `SELECT id, name, role, active, email FROM team_members
     WHERE role IN ('caller', 'sales_manager') ORDER BY role = 'caller' DESC, name`
  );
  if (team.length === 0) throw new Error("no sales team members exist");

  // With no caller picked, open the signed-in person's own workspace if they are on the team.
  const signedIn = (await getSession())?.email;
  const selected =
    team.find((t) => t.id === filters.caller) ??
    team.find((t) => signedIn !== undefined && t.email?.toLowerCase() === signedIn) ??
    team.find((t) => t.active) ??
    team[0]!;
  const caller: CallerIdentity = {
    id: selected.id,
    name: selected.name,
    role: selected.role,
    roleLabel: roleLabel(selected.role),
    isManager: isManagerRole(selected.role),
    active: selected.active,
    email: selected.email,
  };
  const range = parseRange({ range: filters.range });
  // null = every lead, which is what a manager is accountable for.
  const owner = caller.isManager ? null : caller.id;

  const [kpis, pool, queue, next, callbacks, pipeline, alerts, unassigned] = await Promise.all([
    callerKpis(owner, range),
    leadPool(range),
    myLeads(owner, { limit: QUEUE_PAGE, offset: 0 }, { status: filters.status, reveal: false }),
    nextLead(owner, false, false),
    callbacksDue(owner, parseRange({ range: "today" }), 12),
    callerPipeline(owner),
    queryOne<{ n: number }>(
      "SELECT count(*)::int AS n FROM alerts WHERE owner_team = 'sales' AND status <> 'resolved'"
    ),
    queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM sales_leads
       WHERE owner_id IS NULL AND status IN ('new', 'contacted', 'interested', 'callback')`
    ),
  ]);

  // Team panels are only fetched for a manager - a caller never sees them, so
  // there is no reason to run the queries.
  const [leaderboard, sla] = caller.isManager
    ? await Promise.all([callerLeaderboard(range), slaMetrics(null)])
    : [null, null];

  const queueLeads = queue.data.map(mapQueueLead);
  const callNextLead = next.data ? mapCallNext(next.data) : null;
  const selectedLeadId = filters.lead ?? callNextLead?.leadId ?? queueLeads[0]?.leadId ?? null;

  return {
    source: { kind: "live" },
    readOnly: getConfig().EVENTS_DATABASE_READ_ONLY,
    generatedAt: new Date().toISOString(),
    filters,
    caller,
    scope: owner === null ? "team" : "self",
    callerOptions: team.map((t) => ({ value: t.id, label: t.active ? t.name : `${t.name} (inactive)` })),
    kpis: mapKpis(kpis.data, filters.range, owner === null),
    poolSegments: mapPool(pool.data.segments),
    poolActiveUsers: pool.data.active_users,
    callNext: callNextLead,
    unassignedOpenLeads: unassigned?.n ?? 0,
    queue: queueLeads,
    queueTotal: queue.total,
    followUps: callbacks.data.map(
      (c): FollowUp => ({
        callbackId: c.id,
        leadId: c.lead_id,
        userId: c.user_id,
        name: c.name ?? c.user_id,
        dueAt: c.due_at.toISOString(),
        isDue: c.is_due,
        notes: c.notes,
        priority: c.priority as LeadPriority | null,
        reason: c.reason,
      })
    ),
    pipeline: pipeline.data.stages.map((s) => ({ ...s, tone: pipelineStageTone(s.key) })),
    pipelineTotal: pipeline.data.total,
    selectedLead: selectedLeadId ? await loadLeadDetail(selectedLeadId) : null,
    openAlerts: alerts?.n ?? 0,
    leaderboard: leaderboard ? leaderboard.data.callers.map((c) => mapLeaderboard(c, caller.id)) : [],
    sla: sla ? mapSla(sla.data) : [],
  };
}

// --------------------------------------------------------------------------- mappers

type ApiLead = Awaited<ReturnType<typeof myLeads>>["data"][number];

const iso = (d: unknown): string | null =>
  d === null || d === undefined ? null : d instanceof Date ? d.toISOString() : String(d);

function mapQueueLead(l: ApiLead): QueueLead {
  const status = statusPresentation(String(l.lead.status));
  const views = l.signals.pricing_views_30d;
  return {
    leadId: String(l.lead.id),
    userId: l.user.user_id,
    name: l.user.name ?? l.user.user_id,
    priority: l.lead.priority as LeadPriority | null,
    pqlScore: l.user.pql.score,
    reason: String(l.lead.reason ?? "") || "Qualified by product activity",
    autoApplyUsed: l.user.auto_apply.used,
    autoApplyLimit: l.user.auto_apply.limit,
    pricingIntent: pricingIntent(views, l.signals.checkout_started, l.signals.plan_clicks_30d > 0),
    pricingViews: views,
    lastActiveAt: iso(l.user.last_active_at),
    lastContactAt: iso(l.lead.last_contacted_at),
    statusLabel: status.label,
    statusTone: status.tone,
    nextAction: nextActionFor(
      l.lead.last_disposition as string | null,
      l.lead.next_action as string | null,
      l.user.phone !== null
    ),
    slaDueAt: iso(l.lead.sla_due_at),
    slaBreached: Boolean(l.lead.sla_breached),
    pendingDisposition: Boolean(l.lead.pending_disposition),
    callbackDueAt: l.lead.next_callback ? iso(l.lead.next_callback.due_at) : null,
    callbackIsDue: Boolean(l.lead.next_callback?.is_due),
    isOnline: l.user.presence.is_online,
    country: l.user.country,
  };
}

function mapCallNext(l: ApiLead): CallNextLead {
  const base = mapQueueLead(l);
  const firstName = base.name.split(" ")[0] ?? base.name;
  const planInterest = l.signals.plan_clicks_30d > 0 ? "Pro" : null;
  return {
    ...base,
    role: l.context.target_role,
    city: l.context.city,
    planInterest,
    checkoutLabel: l.signals.checkout_abandoned
      ? "Abandoned"
      : l.signals.checkout_started
        ? "Started once"
        : l.signals.plan_clicks_30d > 0
          ? "Plan selected"
          : "Not started",
    freeApplicationsLeft: Math.max(0, base.autoApplyLimit - base.autoApplyUsed),
    pitch: pitchFor({
      firstName,
      used: base.autoApplyUsed,
      limit: base.autoApplyLimit,
      pricingViews: base.pricingViews,
      planInterest,
      checkoutStarted: l.signals.checkout_started,
      paymentFailed: l.signals.payment_failed,
    }),
    why: l.recommended_pitch.why,
    queuedBecause: queuedBecause(base),
  };
}

type ApiKpis = Awaited<ReturnType<typeof callerKpis>>["data"];

/** Short enough to fit a KPI card; the tooltip carries the full definition. */
function delta(current: number, previous: number, range: SalesFilters["range"]): string | null {
  const unit = range === "today" ? "yesterday" : "prev.";
  if (previous === 0) return current === 0 ? null : `+${current} vs ${unit}`;
  const diff = current - previous;
  if (diff === 0) return `Same as ${unit}`;
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff)} vs ${unit}`;
}

function mapKpis(k: ApiKpis, range: SalesFilters["range"], team: boolean): SalesKpi[] {
  // A manager's numbers cover every lead, so "you" would misdescribe them.
  const say = (mine: string, all: string) => (team ? all : mine);
  const card = (
    key: string,
    label: string,
    value: number,
    icon: IconKey,
    tone: Tone,
    caption: string | null,
    captionTone: Tone | null,
    definition: string,
    format: "number" | "currency" = "number"
  ): SalesKpi => ({ key, label, value, format, icon, tone, caption, captionTone, definition });

  return [
    card("assigned", range === "today" ? "Assigned Today" : "Assigned", k.assigned.value, "users", "blue", delta(k.assigned.value, k.assigned.previous, range), "teal", say("Leads created for you inside the selected range.", "Leads created inside the selected range.")),
    card("call_now", "Call Immediately", k.call_immediately, "alert", "red", k.call_immediately > 0 ? "P0 priority" : "Nothing urgent", k.call_immediately > 0 ? "red" : null, say("Open P0 leads in your queue right now.", "Open P0 leads across the team right now.")),
    card("pending", "Pending", k.pending_first_contact, "calendar", "amber", "Need outreach", null, say("Open leads you have never contacted.", "Open leads nobody has contacted yet.")),
    card("callbacks", "Callbacks", k.callbacks_due, "refresh", "purple", "Scheduled", null, say("Pending callbacks you own, due before the end of today.", "Pending team callbacks due before the end of today.")),
    card("connected", "Connected", k.connected.value, "user-check", "teal", k.connected.connect_rate_pct === null ? "No calls yet" : `${k.connected.connect_rate_pct}% connected`, "teal", "Distinct leads whose call connected inside the range."),
    card("converted", "Converted", k.converted.value, "check-circle", "green", delta(k.converted.value, k.converted.previous, range), "green", say("Leads you closed as converted inside the range.", "Leads closed as converted inside the range.")),
    card("revenue", "Revenue", k.revenue, "wallet", "teal", null, null, say("Successful payments inside the range by users whose lead you own, made after the lead was created.", "Successful payments inside the range by users with a sales lead, made after the lead was created."), "currency"),
  ];
}

const POOL_TONES: Record<string, Tone> = {
  product_issue: "slate",
  hot: "red",
  warm: "amber",
  engaged: "blue",
  new_early: "purple",
};

type ApiPool = Awaited<ReturnType<typeof leadPool>>["data"]["segments"];

const mapPool = (segments: ApiPool): PoolSegment[] =>
  segments.map((s) => ({
    key: s.key,
    label: s.label,
    action: s.action,
    users: s.users,
    sharePct: s.share_pct,
    tone: POOL_TONES[s.key] ?? "slate",
  }));

type ApiLeaderboard = Awaited<ReturnType<typeof callerLeaderboard>>["data"]["callers"][number];

const mapLeaderboard = (c: ApiLeaderboard, selfId: string): LeaderboardRow => ({
  callerId: c.caller_id,
  name: c.name ?? c.caller_id,
  role: roleLabel(c.role),
  leads: c.leads,
  calls: c.calls,
  connections: c.connections,
  interested: c.interested,
  conversions: c.conversions,
  revenue: c.revenue,
  conversionRatePct: c.conversion_rate_pct,
  isSelf: c.caller_id === selfId,
});

type ApiSla = Awaited<ReturnType<typeof slaMetrics>>["data"];

function mapSla(s: ApiSla): SlaMetric[] {
  return [
    {
      key: "first_response",
      label: "Average first response",
      value: formatResponseTime(s.avg_first_response_seconds),
      target: "Target < 30m",
      tone: s.avg_first_response_seconds !== null && s.avg_first_response_seconds <= 1800 ? "green" : "amber",
      callToAction: null,
    },
    {
      key: "p0_sla",
      label: "P0 within 15m",
      value: s.p0_within_sla_pct === null ? "—" : `${s.p0_within_sla_pct}%`,
      target: "Target 80%",
      tone: (s.p0_within_sla_pct ?? 0) >= 80 ? "green" : "amber",
      callToAction: s.p0_contacted === 0 ? "No P0 leads contacted yet" : null,
    },
    {
      key: "overdue_p0",
      label: "Overdue P0 leads",
      value: String(s.overdue_p0),
      target: null,
      tone: s.overdue_p0 > 0 ? "red" : "green",
      callToAction: s.overdue_p0 > 0 ? "Needs attention" : null,
    },
    {
      key: "unassigned_hot",
      label: "Unassigned hot leads",
      value: String(s.unassigned_hot),
      target: null,
      tone: s.unassigned_hot > 0 ? "red" : "green",
      callToAction: s.unassigned_hot > 0 ? "Assign now" : null,
    },
  ];
}

// --------------------------------------------------------------------------- lead detail

const ACTIVITY_VERB: Record<string, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  note: "Note",
  disposition: "Outcome",
};

export async function loadLeadDetail(leadId: string): Promise<LeadDetail | null> {
  let lead: Awaited<ReturnType<typeof leadById>>;
  try {
    lead = await leadById(leadId, false);
  } catch {
    return null; // A stale ?lead= in the URL should not blank the page.
  }
  const userId = lead.user.user_id;
  const [sessions, activities] = await Promise.all([
    userSessions(userId, { limit: 4 }, false),
    salesActivities(userId, { limit: 30 }),
  ]);

  const entries: LeadActivity[] = activities.data.map((a) => {
    const row = a as Record<string, unknown>;
    const type = String(row.type) as LeadActivity["type"];
    const outcome = row.outcome ? String(row.outcome).replace(/_/g, " ") : null;
    const disposition = row.disposition ? String(row.disposition).replace(/_/g, " ") : null;
    return {
      id: String(row.id),
      type,
      summary: `${ACTIVITY_VERB[type] ?? type}${outcome ? ` — ${outcome}` : disposition ? ` — ${disposition}` : ""}`,
      detail: row.body ? String(row.body) : null,
      actorName: (row.actor_name as string | null) ?? String(row.actor_id ?? "—"),
      at: (row.occurred_at as Date).toISOString(),
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    };
  });

  const used = lead.user.auto_apply.used;
  const limit = lead.user.auto_apply.limit;
  const status = statusPresentation(String(lead.lead.status));
  const firstName = (lead.user.name ?? userId).split(" ")[0]!;

  return {
    leadId: String(lead.lead.id),
    userId,
    name: lead.user.name ?? userId,
    emailMasked: lead.user.email,
    phoneMasked: lead.user.phone,
    role: lead.context.target_role,
    location: [lead.context.city, countryName(lead.user.country)].filter(Boolean).join(", ") || null,
    joinedAt: iso(lead.user.signup_at),
    lastActiveAt: iso(lead.user.last_active_at),
    isOnline: lead.user.presence.is_online,
    priority: lead.lead.priority as LeadPriority | null,
    pqlScore: lead.user.pql.score,
    statusLabel: status.label,
    whyHot: lead.recommended_pitch.why,
    usage: [
      { label: "Auto Apply", value: `${used}/${limit}`, bar: { used, limit } },
      { label: "Lifecycle", value: String(lead.user.lifecycle_stage).replace(/_/g, " ") },
      { label: "Last active", value: lead.user.last_active_at ? relativeTime(iso(lead.user.last_active_at), Date.now()) : "—" },
    ],
    pricing: [
      { label: "Pricing pages viewed", value: `${lead.signals.pricing_views_30d} times` },
      { label: "Plan clicked", value: lead.signals.plan_clicks_30d > 0 ? `${lead.signals.plan_clicks_30d} times` : "Never" },
      {
        label: "Checkout",
        value: lead.signals.checkout_abandoned
          ? "Abandoned"
          : lead.signals.checkout_started
            ? "Started"
            : "Not started",
      },
      { label: "Payment", value: lead.signals.payment_failed ? "Last attempt failed" : "No failures" },
    ],
    sessions: sessions.data.map((s) => ({
      id: s.session_id,
      startedAt: s.started_at.toISOString(),
      summary: `${s.event_count} event${s.event_count === 1 ? "" : "s"} · ${formatDuration(s.duration_seconds)}${s.device_type ? ` · ${s.device_type}` : ""}`,
    })),
    activities: entries.filter((e) => e.type !== "note"),
    notes: entries.filter((e) => e.type === "note"),
    pitch: pitchFor({
      firstName,
      used,
      limit,
      pricingViews: lead.signals.pricing_views_30d,
      planInterest: lead.signals.plan_clicks_30d > 0 ? "Pro" : null,
      checkoutStarted: lead.signals.checkout_started,
      paymentFailed: lead.signals.payment_failed,
    }),
    nextAction: String(lead.lead.next_action ?? "call"),
    nextActionLabel: lead.lead.next_action
      ? String(lead.lead.next_action).replace(/_/g, " ")
      : "Call and discuss upgrade",
    pendingDisposition: Boolean(lead.lead.pending_disposition),
  };
}
