import { audit } from "@/lib/audit";
import { queryOne, queryRows, withTransaction } from "@/lib/db/pool";
import { ApiError, notFound } from "@/lib/http/errors";
import { definitionsFor, pct } from "@/lib/metrics/definitions";
import { filterMeta, userFilterSql, type UserFilters } from "@/lib/metrics/filters";
import { applyPii } from "@/lib/pii";
import { LIFECYCLE_STAGES } from "@/lib/scoring/lifecycle-config";
import { compileConditions, DSL_SCHEMA_VERSION, describeFields } from "@/lib/segments/conditions";
import { withUserDetails } from "@/lib/user-details";

// Dashboard 6 - User Segmentation & Lifecycle Intelligence (SOP section 13).

export const BREAKDOWNS = { country: "u.country", source: "u.acq_source", target_role: "p.target_role", plan: "u.plan" } as const;
export type Breakdown = keyof typeof BREAKDOWNS;

export async function segmentsSummary(f: UserFilters, breakdown?: Breakdown) {
  const p: unknown[] = [];
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{ stage: string; users: number }>(
    `SELECT COALESCE(ls.stage, 'new') AS stage, count(*) AS users
     FROM users u LEFT JOIN lifecycle_state ls ON ls.user_id = u.user_id
     WHERE true${filter}
     GROUP BY 1`,
    p
  );
  const counts = new Map(rows.map((r) => [r.stage, r.users]));
  const total = rows.reduce((a, r) => a + r.users, 0);

  let composition: unknown = undefined;
  if (breakdown) {
    const p2: unknown[] = [];
    const filter2 = userFilterSql(f, p2);
    const byDim = await queryRows<{ value: string; stage: string; users: number }>(
      `SELECT COALESCE(${BREAKDOWNS[breakdown]}, 'unknown') AS value, COALESCE(ls.stage, 'new') AS stage, count(*) AS users
       FROM users u
       LEFT JOIN lifecycle_state ls ON ls.user_id = u.user_id
       LEFT JOIN user_profiles p ON p.user_id = u.user_id
       WHERE true${filter2}
       GROUP BY 1, 2`,
      p2
    );
    const groups = new Map<string, Record<string, number>>();
    for (const r of byDim) {
      const g = groups.get(r.value) ?? {};
      g[r.stage] = r.users;
      groups.set(r.value, g);
    }
    composition = [...groups.entries()]
      .map(([value, stages]) => {
        const users = Object.values(stages).reduce((a, b) => a + b, 0);
        return { value, users, share_pct: pct(users, total), stages };
      })
      .sort((a, b) => b.users - a.users);
  }

  return {
    data: {
      total_users: total,
      stages: LIFECYCLE_STAGES.map((stage) => ({
        stage,
        users: counts.get(stage) ?? 0,
        share_pct: pct(counts.get(stage) ?? 0, total),
      })),
      ...(breakdown ? { breakdown: { by: breakdown, groups: composition } } : {}),
    },
    meta: { filters: filterMeta(f), snapshot: true, unscored_users_counted_as: "new" },
    definitions: definitionsFor(["lifecycle_stage", "total_users"]),
  };
}

export async function lifecycleMovements(days: number, f: UserFilters, includeInitial: boolean) {
  const p: unknown[] = [days];
  const filter = userFilterSql(f, p);
  const rows = await queryRows<{ from_stage: string | null; to_stage: string; users: number; transitions: number }>(
    `SELECT h.from_stage, h.to_stage, count(DISTINCT h.user_id) AS users, count(*) AS transitions
     FROM lifecycle_history h JOIN users u ON u.user_id = h.user_id
     WHERE h.transitioned_at > now() - make_interval(days => $1)${filter}
     GROUP BY h.from_stage, h.to_stage
     ORDER BY transitions DESC`,
    p
  );
  const moves = rows.filter((r) => r.from_stage !== null);
  const initial = rows.filter((r) => r.from_stage === null);

  const flows = LIFECYCLE_STAGES.map((stage) => ({
    stage,
    entered: moves.filter((m) => m.to_stage === stage).reduce((a, m) => a + m.transitions, 0),
    exited: moves.filter((m) => m.from_stage === stage).reduce((a, m) => a + m.transitions, 0),
  }));

  return {
    data: {
      transitions: (includeInitial ? rows : moves).map((r) => ({
        from: r.from_stage,
        to: r.to_stage,
        users: r.users,
        transitions: r.transitions,
      })),
      stage_flows: flows,
      initial_assignments: initial.reduce((a, r) => a + r.transitions, 0),
    },
    meta: {
      days,
      filters: filterMeta(f),
      definition:
        "Stage transitions recorded by the scoring job in the last N days. from=null rows are a user's first stage assignment (excluded unless include_initial=true).",
    },
  };
}

// --------------------------------------------------------------------------- cohorts

/** Count + sample for a definition. Shared by preview and save so both give the same answer. */
export async function evaluateCohort(definition: unknown, sampleSize: number, reveal = false) {
  const compiled = compileConditions(definition);
  const [count, sample] = await Promise.all([
    queryOne<{ n: number }>(`SELECT count(*) AS n FROM v_user_facts f WHERE ${compiled.sql}`, compiled.params),
    sampleSize > 0
      ? queryRows<{ user_id: string; name: string | null; email: string | null; phone: string | null; country: string | null; lifecycle_stage: string; pql_score: number; auto_apply_used: number; plan: string; last_active_at: Date | null }>(
          `SELECT f.user_id, f.name, f.email, f.phone, f.country, f.lifecycle_stage, f.pql_score, f.auto_apply_used, f.plan,
                  f.last_active_at
           FROM v_user_facts f WHERE ${compiled.sql}
           ORDER BY f.pql_score DESC, f.user_id LIMIT ${Math.min(100, sampleSize)}`,
          compiled.params
        )
      : Promise.resolve([]),
  ]);
  const detailed = await withUserDetails(sample);
  return { count: count?.n ?? 0, sample: detailed.map((s) => applyPii(s, reveal)) };
}

export async function saveCohort(input: { id?: string; name: string; description?: string; definition: unknown; actor: string | null }) {
  const { count } = await evaluateCohort(input.definition, 0);
  const stored = { schema_version: DSL_SCHEMA_VERSION, ...(input.definition as object) };

  return withTransaction(async (client) => {
    let cohortId = input.id;
    let version = 1;
    if (cohortId) {
      const { rows } = await client.query<{ current_version: number }>(
        `UPDATE saved_cohorts SET current_version = current_version + 1, name = $2, description = COALESCE($3, description),
                updated_at = now()
         WHERE id = $1 RETURNING current_version`,
        [cohortId, input.name, input.description ?? null]
      );
      if (!rows[0]) throw notFound("Cohort");
      version = rows[0].current_version;
    } else {
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO saved_cohorts (name, description, created_by) VALUES ($1, $2, $3) RETURNING id",
        [input.name, input.description ?? null, input.actor]
      );
      cohortId = rows[0]!.id;
    }
    await client.query(
      `INSERT INTO saved_cohort_versions (cohort_id, version, definition, user_count, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [cohortId, version, JSON.stringify(stored), count, input.actor]
    );
    await audit(
      { actorId: input.actor, action: version === 1 ? "cohort.created" : "cohort.versioned", entityType: "saved_cohort", entityId: cohortId, after: { version, definition: stored } },
      client
    );
    return { id: cohortId, name: input.name, version, user_count: count, definition: stored };
  });
}

export async function listCohorts(page: { limit: number; offset: number }, withCounts: boolean) {
  const [rows, total] = await Promise.all([
    queryRows<{ id: string; definition: unknown }>(
      `SELECT c.id, c.name, c.description, c.current_version AS version, c.created_by, c.created_at, c.updated_at,
              v.definition, v.user_count AS user_count_at_save, v.created_at AS version_created_at
       FROM saved_cohorts c
       JOIN saved_cohort_versions v ON v.cohort_id = c.id AND v.version = c.current_version
       ORDER BY c.updated_at DESC, c.id
       LIMIT ${page.limit} OFFSET ${page.offset}`
    ),
    queryOne<{ n: number }>("SELECT count(*) AS n FROM saved_cohorts"),
  ]);
  const data = [];
  for (const r of rows) {
    let liveCount: number | null = null;
    if (withCounts) {
      try {
        liveCount = (await evaluateCohort(r.definition, 0)).count;
      } catch (err) {
        // A definition saved under an older field whitelist may no longer compile.
        if (!(err instanceof ApiError)) throw err;
      }
    }
    data.push({ ...r, ...(withCounts ? { live_user_count: liveCount } : {}) });
  }
  return { data, total: total?.n ?? 0 };
}

export const cohortFields = describeFields;
