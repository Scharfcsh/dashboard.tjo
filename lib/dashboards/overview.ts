import { queryOne, queryRows } from "@/lib/db/pool";
import { filterMeta, userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import { definitionsFor, pct, trend } from "@/lib/metrics/definitions";
import * as K from "@/lib/metrics/kpis";
import { HOT_PQL_MIN_SCORE } from "@/lib/scoring/pql-config";
import { rangeMeta, type DateRange } from "@/lib/time/business-time";
import { withUserDetails } from "@/lib/user-details";

// Dashboard 1 - Founder Revenue Command Center (SOP section 8).

const snapshot = (value: number) => ({ value, previous: null, change_pct: null, snapshot: true });

export async function overviewKpis(range: DateRange, f: UserFilters) {
  const [
    total,
    active,
    pricing,
    pricingViews,
    checkout,
    abandoned,
    paid,
    revenue,
    charged,
    paymentFailed,
    returned,
    hot,
    aa40,
    aa45,
    exhausted,
    dormant,
  ] = await Promise.all([
    K.withPrevious(K.totalUsers, range, f),
    K.withPrevious(K.activeUsers, range, f),
    K.withPrevious(K.pricingVisitors, range, f),
    K.pricingViews(range, f),
    K.withPrevious(K.checkoutStarters, range, f),
    K.checkoutAbandoners(range, f),
    K.withPrevious(K.paidConversions, range, f),
    K.withPrevious(K.revenue, range, f),
    K.payingUsersCharged(range, f),
    K.withPrevious(K.paymentFailedUsers, range, f),
    K.withPrevious(K.returnedUsers, range, f),
    K.hotPqls(f),
    K.unpaidUsageAtLeast(40, f),
    K.unpaidUsageAtLeast(45, f),
    K.unpaidUsageAtLeast("limit", f),
    K.dormant3d(f),
  ]);
  const newUsers = await K.newUsers(range, f);

  return {
    data: {
      primary: {
        total_users: { ...trend(total[0], total[1]), new_in_range: newUsers },
        active_users: { ...trend(active[0], active[1]), share_of_total_pct: pct(active[0], total[0]) },
        hot_pqls: snapshot(hot),
        pricing_visitors: { ...trend(pricing[0], pricing[1]), pricing_views: pricingViews },
        checkout_started: { ...trend(checkout[0], checkout[1]), abandoned_users: abandoned },
        paid_conversions: {
          ...trend(paid[0], paid[1]),
          revenue: trend(revenue[0], revenue[1]),
          paying_users_charged: charged,
        },
      },
      secondary: {
        free_applies_40_plus: snapshot(aa40),
        free_applies_45_plus: snapshot(aa45),
        quota_exhausted: snapshot(exhausted),
        payment_failed_users: trend(paymentFailed[0], paymentFailed[1]),
        dormant_3d: snapshot(dormant),
        returned_users: trend(returned[0], returned[1]),
      },
    },
    meta: { ...rangeMeta(range), filters: filterMeta(f) },
    definitions: definitionsFor([
      "total_users",
      "new_users",
      "active_users",
      "hot_pqls",
      "pricing_visitors",
      "pricing_views",
      "checkout_started",
      "checkout_abandoned",
      "paid_conversions",
      "revenue",
      "paying_users_charged",
      "free_applies_40_plus",
      "free_applies_45_plus",
      "quota_exhausted",
      "payment_failed_users",
      "dormant_3d",
      "returned_users",
      "trend_change_pct",
    ]),
  };
}

const FUNNEL_STAGES = ["active", "activated", "core_feature", "pql", "pricing", "checkout", "paid"] as const;

export async function overviewFunnel(range: DateRange, f: UserFilters) {
  const p: unknown[] = [range.from, range.to, range.startUtc, range.endUtc, HOT_PQL_MIN_SCORE];
  const filter = userFilterSql(f, p);
  const row = await queryOne<Record<string, string>>(
    `WITH period AS (
       SELECT d.user_id,
              bool_or(d.is_active)                AS active,
              bool_or(d.auto_apply_success > 0)   AS core_feature,
              bool_or(d.pricing_views > 0)        AS pricing,
              bool_or(d.checkout_started > 0)     AS checkout
       FROM user_daily_metrics d JOIN users u ON u.user_id = d.user_id
       WHERE d.business_date BETWEEN $1::date AND $2::date${filter}
       GROUP BY d.user_id
     ),
     flags AS (
       SELECT p.user_id, p.core_feature, p.pricing, p.checkout,
              EXISTS (SELECT 1 FROM user_milestones m WHERE m.user_id = p.user_id AND m.milestone = 'activated' AND m.first_at < $4) AS activated,
              COALESCE((SELECT s.score FROM pql_scores s WHERE s.user_id = p.user_id), 0) >= $5 AS pql,
              EXISTS (SELECT 1 FROM user_milestones m WHERE m.user_id = p.user_id AND m.milestone = 'first_paid'
                        AND m.first_at >= $3 AND m.first_at < $4) AS paid
       FROM period p WHERE p.active
     )
     SELECT count(*)                                                                         AS active,
            count(*) FILTER (WHERE activated)                                                AS activated,
            count(*) FILTER (WHERE core_feature)                                             AS core_feature,
            count(*) FILTER (WHERE pql)                                                      AS pql,
            count(*) FILTER (WHERE pricing)                                                  AS pricing,
            count(*) FILTER (WHERE checkout)                                                 AS checkout,
            count(*) FILTER (WHERE paid)                                                     AS paid,
            count(*) FILTER (WHERE activated AND core_feature)                               AS n_core_feature,
            count(*) FILTER (WHERE activated AND core_feature AND pql)                       AS n_pql,
            count(*) FILTER (WHERE activated AND core_feature AND pql AND pricing)           AS n_pricing,
            count(*) FILTER (WHERE activated AND core_feature AND pql AND pricing AND checkout) AS n_checkout,
            count(*) FILTER (WHERE activated AND core_feature AND pql AND pricing AND checkout AND paid) AS n_paid
     FROM flags`,
    p
  );
  const num = (k: string) => Number(row?.[k] ?? 0);
  const nested: Record<string, number> = {
    active: num("active"),
    activated: num("activated"),
    core_feature: num("n_core_feature"),
    pql: num("n_pql"),
    pricing: num("n_pricing"),
    checkout: num("n_checkout"),
    paid: num("n_paid"),
  };

  const stages = FUNNEL_STAGES.map((stage, i) => {
    const count = nested[stage]!;
    const prev = i === 0 ? null : nested[FUNNEL_STAGES[i - 1]!]!;
    return {
      stage,
      count,
      independent_count: num(stage),
      conversion_from_previous_pct: prev === null ? null : pct(count, prev),
      conversion_from_active_pct: pct(count, nested.active!),
    };
  });

  return {
    data: { stages },
    meta: {
      ...rangeMeta(range),
      filters: filterMeta(f),
      funnel_logic:
        "Strictly nested: each stage counts active users who also satisfied every earlier stage. independent_count ignores earlier stages.",
    },
    definitions: definitionsFor(["active_users", "activated_users", "core_feature_users", "pql_users", "pricing_visitors", "checkout_started", "paid_conversions"]),
  };
}

export async function salesSummary(range: DateRange) {
  const p = [range.startUtc, range.endUtc];
  const [stages, performers] = await Promise.all([
    queryOne<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM sales_leads WHERE created_at >= $1 AND created_at < $2)                         AS warm_leads,
         (SELECT count(DISTINCT lead_id) FROM sales_assignments WHERE assigned_at >= $1 AND assigned_at < $2)  AS assigned,
         (SELECT count(DISTINCT lead_id) FROM sales_activities
            WHERE type IN ('call', 'whatsapp', 'email') AND occurred_at >= $1 AND occurred_at < $2)            AS contacted,
         (SELECT count(DISTINCT lead_id) FROM sales_activities
            WHERE type = 'call' AND outcome = 'connected' AND occurred_at >= $1 AND occurred_at < $2)           AS connected,
         (SELECT count(DISTINCT lead_id) FROM sales_activities
            WHERE type = 'disposition' AND disposition IN ('interested', 'wants_to_buy')
              AND occurred_at >= $1 AND occurred_at < $2)                                                      AS interested,
         (SELECT count(*) FROM sales_leads WHERE status = 'converted' AND closed_at >= $1 AND closed_at < $2)  AS converted,
         (SELECT count(*) FROM sales_leads WHERE status IN ('new', 'contacted', 'interested', 'callback'))     AS open_now,
         (SELECT count(*) FROM sales_leads WHERE status IN ('new', 'contacted', 'interested', 'callback')
            AND sla_due_at < now() AND last_contacted_at IS NULL)                                              AS overdue_sla_now`,
      p
    ),
    queryRows<{ actor_id: string; name: string | null; contacts: string; connected: string; converted: string }>(
      `SELECT a.actor_id, tm.name,
              count(*) FILTER (WHERE a.type IN ('call', 'whatsapp', 'email'))                  AS contacts,
              count(*) FILTER (WHERE a.type = 'call' AND a.outcome = 'connected')              AS connected,
              count(*) FILTER (WHERE a.type = 'disposition' AND a.disposition = 'converted')   AS converted
       FROM sales_activities a
       LEFT JOIN team_members tm ON tm.id::text = a.actor_id
       WHERE a.occurred_at >= $1 AND a.occurred_at < $2
       GROUP BY a.actor_id, tm.name
       ORDER BY converted DESC, connected DESC, contacts DESC
       LIMIT 10`,
      p
    ),
  ]);
  const n = (k: string) => Number(stages?.[k] ?? 0);
  return {
    data: {
      pipeline: {
        warm_leads: n("warm_leads"),
        assigned: n("assigned"),
        contacted: n("contacted"),
        connected: n("connected"),
        interested: n("interested"),
        converted: n("converted"),
      },
      open_leads_now: n("open_now"),
      overdue_sla_now: n("overdue_sla_now"),
      top_performers: performers.map((r) => ({
        actor_id: r.actor_id,
        name: r.name,
        contacts: Number(r.contacts),
        connected: Number(r.connected),
        converted: Number(r.converted),
      })),
    },
    meta: {
      ...rangeMeta(range),
      definitions: {
        warm_leads: "Leads created in the range (rule-generated or manual).",
        assigned: "Distinct leads given an owner in the range.",
        contacted: "Distinct leads with a logged call, WhatsApp or email in the range.",
        connected: "Distinct leads with a call whose outcome was 'connected'.",
        interested: "Distinct leads dispositioned interested or wants_to_buy.",
        converted: "Leads closed as converted in the range.",
      },
    },
  };
}

export async function alertsSummary(range: DateRange, limit: number) {
  const p = [range.startUtc, range.endUtc];
  const [counts, recent] = await Promise.all([
    queryOne<{ open_critical: string; critical_in_range: string; open_total: string; overdue: string }>(
      `SELECT count(*) FILTER (WHERE priority = 'P0' AND status <> 'resolved')                         AS open_critical,
              count(*) FILTER (WHERE priority = 'P0' AND created_at >= $1 AND created_at < $2)         AS critical_in_range,
              count(*) FILTER (WHERE status <> 'resolved')                                             AS open_total,
              count(*) FILTER (WHERE status <> 'resolved' AND sla_due_at < now())                      AS overdue
       FROM alerts`,
      p
    ),
    queryRows(
      `SELECT a.id, a.rule_id, a.title, a.reason, a.priority, a.category, a.owner_team, a.status, a.user_id,
              u.name AS user_name, a.sla_due_at, (a.status <> 'resolved' AND a.sla_due_at < now()) AS overdue, a.created_at
       FROM alerts a LEFT JOIN users u ON u.user_id = a.user_id
       WHERE a.priority = 'P0' AND a.status <> 'resolved'
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit]
    ),
  ]);
  return {
    data: {
      open_critical: Number(counts?.open_critical ?? 0),
      critical_created_in_range: Number(counts?.critical_in_range ?? 0),
      open_total: Number(counts?.open_total ?? 0),
      overdue_sla: Number(counts?.overdue ?? 0),
      recent_critical: await withUserDetails(recent, { name: "user_name", email: null, phone: null }),
    },
    meta: {
      ...rangeMeta(range),
      definitions: {
        open_critical: "P0 alerts not yet resolved (any creation date).",
        critical_created_in_range: "P0 alerts created in the range.",
        overdue_sla: "Unresolved alerts past sla_due_at.",
      },
    },
  };
}
