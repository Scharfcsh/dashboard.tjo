import { queryOne, queryRows } from "@/lib/db/pool";
import { userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import { formatUserSummary, USER_SUMMARY_COLUMNS, USER_SUMMARY_JOINS, type UserSummaryRow } from "@/lib/users/summary";

// ---------------------------------------------------------------------------
// Ranked unpaid users with monetization signals - the one query behind
// "Today's Highest Revenue Opportunities" (D1) and "Highest Priority Upgrade
// Leads" (D4). Signals come from the facts snapshot scoring stored alongside the
// score, so the row's reasons, score and signals always agree.
// ---------------------------------------------------------------------------

export type PricingIntent = "viewed" | "plan_clicked" | "checkout" | "abandoned" | "none";

export const PRICING_INTENTS = ["viewed", "plan_clicked", "checkout", "abandoned", "none"] as const;

export interface OpportunityOptions {
  minScore: number;
  priority?: "P0" | "P1" | "P2";
  trigger?: string;
  unassignedOnly?: boolean;
  reveal: boolean;
  /** Dashboard 4 filters. All optional, so Dashboard 1's call is unaffected. */
  usageMin?: number;
  usageMax?: number;
  pricingIntent?: PricingIntent;
  ownerId?: string;
  leadStatus?: string;
  includePaid?: boolean;
}

/**
 * Pricing intent, expressed against the same frozen facts snapshot the row's
 * signals come from - so a row can never be filtered in by one definition and
 * displayed with another.
 */
const PRICING_INTENT_SQL: Record<PricingIntent, string> = {
  viewed: `COALESCE((ps.facts->>'pricingViews30d')::int, 0) > 0`,
  plan_clicked: `COALESCE((ps.facts->>'planClicks30d')::int, 0) > 0`,
  checkout: `COALESCE((ps.facts->>'checkoutStarted30d')::int, 0) > 0`,
  abandoned: `COALESCE((ps.facts->>'checkoutAbandoned7d')::boolean, false)`,
  none: `COALESCE((ps.facts->>'pricingViews30d')::int, 0) = 0 AND COALESCE((ps.facts->>'planClicks30d')::int, 0) = 0`,
};

interface OpportunityRow extends UserSummaryRow {
  last_plan_clicked: string | null;
  facts: {
    pricingViews30d?: number;
    planClicks30d?: number;
    checkoutStarted30d?: number;
    checkoutAbandoned7d?: boolean;
    paymentFailedUnresolved?: boolean;
  } | null;
}

export async function listOpportunities(f: UserFilters, page: { limit: number; offset: number }, opts: OpportunityOptions) {
  const p: unknown[] = [opts.minScore];
  const paid = opts.includePaid ? "" : "NOT is_paid_user(u.user_id) AND ";
  let where = `WHERE ${paid}(ps.priority IS NOT NULL OR ps.score >= $1)`;
  if (opts.priority) {
    p.push(opts.priority);
    where += ` AND ps.priority = $${p.length}`;
  }
  if (opts.trigger) {
    p.push(opts.trigger);
    where += ` AND ps.priority_trigger = $${p.length}`;
  }
  if (opts.unassignedOnly) {
    where += ` AND NOT EXISTS (SELECT 1 FROM sales_leads l WHERE l.user_id = u.user_id AND l.owner_id IS NOT NULL
                                 AND l.status IN ('new', 'contacted', 'interested', 'callback'))`;
  }
  if (opts.usageMin !== undefined) {
    p.push(opts.usageMin);
    where += ` AND COALESCE(aau.used, 0) >= $${p.length}`;
  }
  if (opts.usageMax !== undefined) {
    p.push(opts.usageMax);
    where += ` AND COALESCE(aau.used, 0) <= $${p.length}`;
  }
  if (opts.pricingIntent) where += ` AND (${PRICING_INTENT_SQL[opts.pricingIntent]})`;
  if (opts.ownerId) {
    p.push(opts.ownerId);
    where += ` AND lead.owner_id = $${p.length}::uuid`;
  }
  if (opts.leadStatus === "unassigned") {
    where += ` AND lead.owner_id IS NULL`;
  } else if (opts.leadStatus) {
    p.push(opts.leadStatus);
    where += ` AND lead.status = $${p.length}`;
  }
  where += userFilterSql(f, p);

  const [rows, total] = await Promise.all([
    queryRows<OpportunityRow>(
      `SELECT ${USER_SUMMARY_COLUMNS}, ps.facts, plan.event_name AS last_plan_clicked
       FROM users u ${USER_SUMMARY_JOINS}
       LEFT JOIN LATERAL (
         SELECT e.event_name FROM user_events e
         WHERE e.user_id = u.user_id AND e.event_name IN ('pro_clicked', 'premium_clicked')
         ORDER BY e.occurred_at DESC LIMIT 1
       ) plan ON true
       ${where}
       ORDER BY ps.priority ASC NULLS LAST, ps.score DESC, u.last_active_at DESC NULLS LAST, u.user_id
       LIMIT ${page.limit} OFFSET ${page.offset}`,
      p
    ),
    queryOne<{ n: string }>(`SELECT count(*) AS n FROM users u ${USER_SUMMARY_JOINS} ${where}`, p),
  ]);

  const data = rows.map((r) => {
    const facts = r.facts ?? {};
    const checkout_status = facts.checkoutAbandoned7d
      ? "abandoned"
      : (facts.checkoutStarted30d ?? 0) > 0
        ? "started"
        : (facts.planClicks30d ?? 0) > 0
          ? "plan_selected"
          : "not_started";
    return {
      ...formatUserSummary(r, opts.reveal),
      signals: {
        pricing_views_30d: facts.pricingViews30d ?? 0,
        plan_clicks_30d: facts.planClicks30d ?? 0,
        checkout_status,
        payment_failed: facts.paymentFailedUnresolved ?? false,
        free_applies_remaining: Math.max(0, r.auto_apply_limit - r.auto_apply_used),
      },
      last_plan_clicked: r.last_plan_clicked === "premium_clicked" ? "Premium" : r.last_plan_clicked === "pro_clicked" ? "Pro" : null,
      lead_reason: r.priority_reason ?? (r.pql_reasons ?? []).slice(0, 3).map((x) => x.label).join(" + "),
    };
  });
  return { data, total: Number(total?.n ?? 0), userIds: rows.map((r) => r.user_id) };
}
