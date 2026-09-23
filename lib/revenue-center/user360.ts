import "server-only";
import { queryRows } from "@/lib/db/pool";
import { currentSession } from "@/lib/dashboards/live";
import { salesActivities, user360 } from "@/lib/dashboards/user360";
import { eventDefinition } from "@/lib/events/catalog";
import { humanize } from "@/lib/revenue-center/format";
import type { ContactEntry, TimelineEvent, Tone, User360View } from "@/lib/revenue-center/types";

// Live User 360 for the Revenue Command Center drawer, built from the same
// functions behind /api/users/:id/360 and /api/live/users/:id/session.

const FAMILY_TONE: Record<string, Tone> = {
  pricing: "amber",
  checkout: "red",
  payment: "green",
  subscription: "green",
  auto_apply: "teal",
  usage_milestone: "purple",
  resume: "blue",
  jobs: "slate",
  manual_apply: "blue",
};

type Profile = Awaited<ReturnType<typeof user360>>["data"];

export async function loadUser360(userId: string): Promise<User360View> {
  const [profile, session, activities, team] = await Promise.all([
    user360(userId, false),
    currentSession(userId),
    salesActivities(userId, { limit: 10 }),
    queryRows<{ id: string; name: string }>("SELECT id, name FROM team_members WHERE active ORDER BY name"),
  ]);
  const d: Profile = profile.data;
  const s = session.data;

  const activity: TimelineEvent[] = (s?.timeline ?? [])
    .slice()
    .reverse()
    .slice(0, 12)
    .map((e) => {
      const def = eventDefinition(e.event_name);
      return {
        id: e.event_id,
        at: new Date(e.occurred_at).toISOString(),
        label: e.label || humanize(e.event_name),
        detail: e.page ?? (e.source === "server" ? "Server event" : null),
        tone: FAMILY_TONE[def.family] ?? "slate",
      };
    });

  const contacts: ContactEntry[] = (activities.data as unknown as {
    id: string;
    type: ContactEntry["type"];
    outcome: string | null;
    disposition: string | null;
    body: string | null;
    actor_name: string | null;
    actor_id: string;
    occurred_at: Date;
  }[]).map((a) => ({
    id: a.id,
    type: a.type,
    summary: [humanize(a.type), a.outcome ? humanize(a.outcome) : null, a.disposition ? humanize(a.disposition) : null, a.body]
      .filter(Boolean)
      .join(" · "),
    actorName: a.actor_name ?? a.actor_id,
    at: new Date(a.occurred_at).toISOString(),
  }));

  const lead = d.sales.open_lead as { id: string; status: string; owner_id: string | null; owner_name: string | null; last_contacted_at: Date | null } | null;
  const pql = d.pql as { score: number; category: string; priority: "P0" | "P1" | "P2" | null; priority_reason: string | null; next_best_action: string | null; reasons: { label: string; points: number }[] } | null;
  const lifecycle = d.lifecycle as { stage: string } | null;
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

  return {
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
    lifecycleStage: lifecycle?.stage ?? "new",
    signupAt: iso(d.identity.signup_at),
    lastActiveAt: iso(d.identity.last_active_at),
    acquisition: { source: d.acquisition.source as string | null, campaign: d.acquisition.campaign as string | null },
    pql: pql
      ? {
          score: pql.score,
          category: pql.category,
          priority: pql.priority,
          reason: pql.priority_reason,
          nextBestAction: pql.next_best_action,
          reasons: pql.reasons.map((r) => ({ label: r.label, points: r.points })),
        }
      : null,
    autoApply: {
      used: d.product_usage.auto_apply.used,
      limit: d.product_usage.auto_apply.limit,
      successful: d.product_usage.auto_apply.successful,
      failed: d.product_usage.auto_apply.failed,
    },
    intent: {
      pricingViews: d.subscription.purchase_intent.pricing_views,
      planClicks: d.subscription.purchase_intent.plan_clicks,
      checkoutsStarted: d.subscription.purchase_intent.checkouts_started,
      checkoutsAbandoned: d.subscription.purchase_intent.checkouts_abandoned,
    },
    session: s
      ? {
          startedAt: new Date(s.started_at).toISOString(),
          durationSeconds: s.is_online
            ? Math.max(s.duration_seconds, Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000))
            : s.duration_seconds,
          device: [s.device_type ? humanize(s.device_type) : null, s.browser].filter(Boolean).join(" · ") || null,
          isCurrent: s.is_current,
        }
      : null,
    activity,
    sales: {
      leadId: lead?.id ?? null,
      leadStatus: lead?.status ?? null,
      ownerId: lead?.owner_id ?? null,
      ownerName: lead?.owner_name ?? null,
      lastContactAt: iso(lead?.last_contacted_at),
      contacts,
    },
    team: team.map((t) => ({ value: t.id, label: t.name })),
  };
}
