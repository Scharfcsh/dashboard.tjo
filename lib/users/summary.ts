import { applyPii } from "@/lib/pii";

// ---------------------------------------------------------------------------
// The compact "user row" every operational table shows (revenue opportunities,
// hot leads, live users, my leads): identity, usage, PQL, lifecycle, owner,
// last contact. One SELECT so the columns mean the same thing in every list.
//
// Expects `u` = users. Joins are added by USER_SUMMARY_JOINS.
// ---------------------------------------------------------------------------

export const USER_SUMMARY_COLUMNS = `
  u.user_id, u.name, u.email, u.phone, u.country, u.plan, u.acq_source, u.signup_at, u.last_active_at,
  is_paid_user(u.user_id)                           AS is_paid,
  COALESCE(ls.stage, 'new')                         AS lifecycle_stage,
  COALESCE(ps.score, 0)                             AS pql_score,
  COALESCE(ps.category, 'early')                    AS pql_category,
  ps.priority, ps.priority_trigger, ps.priority_reason, ps.next_best_action, ps.reasons AS pql_reasons,
  COALESCE(aau.used, 0)                             AS auto_apply_used,
  COALESCE(aau.usage_limit, 50)                     AS auto_apply_limit,
  COALESCE(aau.started_total, 0)                    AS auto_apply_started_total,
  COALESCE(aau.success_total, 0)                    AS auto_apply_success_total,
  pr.last_seen_at, pr.current_page, pr.last_event_name,
  COALESCE(pr.last_seen_at > online_cutoff(), false) AS is_online,
  lead.id AS lead_id, lead.status AS lead_status, lead.owner_id, tm.name AS owner_name,
  lead.last_contacted_at`;

export const USER_SUMMARY_JOINS = `
  LEFT JOIN lifecycle_state ls   ON ls.user_id = u.user_id
  LEFT JOIN pql_scores ps        ON ps.user_id = u.user_id
  LEFT JOIN auto_apply_usage aau ON aau.user_id = u.user_id
  LEFT JOIN user_presence pr     ON pr.user_id = u.user_id
  LEFT JOIN LATERAL (
    SELECT l.id, l.status, l.owner_id, l.last_contacted_at FROM sales_leads l
    WHERE l.user_id = u.user_id AND l.status IN ('new', 'contacted', 'interested', 'callback')
    LIMIT 1
  ) lead ON true
  LEFT JOIN team_members tm ON tm.id = lead.owner_id`;

export interface UserSummaryRow {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  plan: string;
  acq_source: string | null;
  signup_at: Date | null;
  last_active_at: Date | null;
  is_paid: boolean;
  lifecycle_stage: string;
  pql_score: number;
  pql_category: string;
  priority: string | null;
  priority_trigger: string | null;
  priority_reason: string | null;
  next_best_action: string | null;
  pql_reasons: { rule_id: string; label: string; points: number }[] | null;
  auto_apply_used: number;
  auto_apply_limit: number;
  auto_apply_started_total: number;
  auto_apply_success_total: number;
  last_seen_at: Date | null;
  current_page: string | null;
  last_event_name: string | null;
  is_online: boolean;
  lead_id: string | null;
  lead_status: string | null;
  owner_id: string | null;
  owner_name: string | null;
  last_contacted_at: Date | null;
}

export function formatUserSummary(r: UserSummaryRow, reveal: boolean) {
  const masked = applyPii(r, reveal);
  return {
    user_id: r.user_id,
    name: r.name,
    email: masked.email,
    phone: masked.phone,
    country: r.country,
    plan: r.plan,
    is_paid: r.is_paid,
    acquisition_source: r.acq_source,
    signup_at: r.signup_at,
    last_active_at: r.last_active_at,
    lifecycle_stage: r.lifecycle_stage,
    pql: {
      score: r.pql_score,
      category: r.pql_category,
      priority: r.priority,
      trigger: r.priority_trigger,
      reason: r.priority_reason,
      next_best_action: r.next_best_action,
      top_reasons: (r.pql_reasons ?? []).slice(0, 3),
    },
    auto_apply: {
      used: r.auto_apply_used,
      limit: r.auto_apply_limit,
      started_total: r.auto_apply_started_total,
      success_total: r.auto_apply_success_total,
    },
    presence: {
      is_online: r.is_online,
      last_seen_at: r.last_seen_at,
      current_page: r.current_page,
      last_event: r.last_event_name,
    },
    sales: {
      lead_id: r.lead_id,
      lead_status: r.lead_status,
      owner_id: r.owner_id,
      owner_name: r.owner_name,
      last_contacted_at: r.last_contacted_at,
    },
  };
}
