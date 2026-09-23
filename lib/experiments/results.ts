import { queryRows } from "@/lib/db/pool";
import { confidence, conversionRate, relativeLift, type VariantCounts } from "@/lib/experiments/stats";
import { userFilterSql, type UserFilters } from "@/lib/metrics/filters";

// ---------------------------------------------------------------------------
// "Free Plan Experiments" (Dashboard 4). Conversion counts a paid milestone
// that happened AFTER the user was bucketed - a user who was already paying
// when the experiment reached them cannot be credited to it.
// ---------------------------------------------------------------------------

export interface ExperimentVariantResult {
  variant: string;
  label: string | null;
  is_control: boolean;
  users: number;
  converted: number;
  conversion_rate_pct: number | null;
  lift_vs_control_pct: number | null;
  confidence_pct: number | null;
}

export interface ExperimentResult {
  id: string;
  name: string;
  hypothesis: string | null;
  status: string;
  started_at: Date | null;
  ended_at: Date | null;
  users: number;
  variants: ExperimentVariantResult[];
}

interface Row {
  id: string;
  name: string;
  hypothesis: string | null;
  status: string;
  started_at: Date | null;
  ended_at: Date | null;
  variant: string;
  label: string | null;
  is_control: boolean;
  users: number;
  converted: number;
}

export async function experimentResults(f: UserFilters): Promise<ExperimentResult[]> {
  const p: unknown[] = [];
  const filter = userFilterSql(f, p);
  const rows = await queryRows<Row>(
    `SELECT e.id, e.name, e.hypothesis, e.status, e.started_at, e.ended_at,
            v.variant, v.label, v.is_control,
            count(a.user_id)                                        AS users,
            count(paid.user_id) FILTER (WHERE paid.first_at > a.assigned_at) AS converted
     FROM experiments e
     JOIN experiment_variants v      ON v.experiment_id = e.id
     LEFT JOIN experiment_assignments a ON a.experiment_id = e.id AND a.variant = v.variant
     LEFT JOIN users u               ON u.user_id = a.user_id
     LEFT JOIN user_milestones paid  ON paid.user_id = a.user_id AND paid.milestone = 'first_paid'
     WHERE e.status <> 'archived'
       AND (a.user_id IS NULL OR u.user_id IS NOT NULL${filter})
     GROUP BY e.id, e.name, e.hypothesis, e.status, e.started_at, e.ended_at, v.variant, v.label, v.is_control
     ORDER BY e.started_at DESC NULLS LAST, e.id, v.is_control DESC, v.variant`,
    p
  );

  const byExperiment = new Map<string, ExperimentResult>();
  const counts = new Map<string, VariantCounts[]>();

  for (const r of rows) {
    let exp = byExperiment.get(r.id);
    if (!exp) {
      exp = {
        id: r.id,
        name: r.name,
        hypothesis: r.hypothesis,
        status: r.status,
        started_at: r.started_at,
        ended_at: r.ended_at,
        users: 0,
        variants: [],
      };
      byExperiment.set(r.id, exp);
      counts.set(r.id, []);
    }
    const c: VariantCounts = { users: Number(r.users), converted: Number(r.converted) };
    counts.get(r.id)!.push(c);
    exp.users += c.users;
    exp.variants.push({
      variant: r.variant,
      label: r.label,
      is_control: r.is_control,
      users: c.users,
      converted: c.converted,
      conversion_rate_pct: conversionRate(c),
      lift_vs_control_pct: null,
      confidence_pct: null,
    });
  }

  for (const exp of byExperiment.values()) {
    const controlIndex = exp.variants.findIndex((v) => v.is_control);
    if (controlIndex === -1) continue;
    const control = counts.get(exp.id)![controlIndex]!;
    exp.variants.forEach((v, i) => {
      if (v.is_control) return;
      const arm = counts.get(exp.id)![i]!;
      v.lift_vs_control_pct = relativeLift(control, arm);
      v.confidence_pct = confidence(control, arm);
    });
  }

  return [...byExperiment.values()];
}
