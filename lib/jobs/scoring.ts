import { getPool, withTransaction } from "@/lib/db/pool";
import { chunk } from "@/lib/jobs/dirty";
import { loadFacts } from "@/lib/jobs/facts";
import { computeLifecycle } from "@/lib/scoring/lifecycle";
import { LIFECYCLE_RULES_VERSION } from "@/lib/scoring/lifecycle-config";
import { pqlChanged, scorePql, type PqlReason } from "@/lib/scoring/pql";
import { computePriority } from "@/lib/scoring/priority";

// ---------------------------------------------------------------------------
// Writes pql_scores (+ history on change) and lifecycle_state (+ history on
// transition). The ONLY writer of those tables; every endpoint reads them.
// ---------------------------------------------------------------------------

const BATCH = 500;

export interface ScoringStats {
  scored: number;
  score_changes: number;
  stage_changes: number;
}

export async function scoreUsers(userIds: string[], now = new Date()): Promise<ScoringStats> {
  const stats: ScoringStats = { scored: 0, score_changes: 0, stage_changes: 0 };
  const unique = [...new Set(userIds)];

  for (const batch of chunk(unique, BATCH)) {
    const facts = await loadFacts(batch, now);
    const prevRows = (
      await getPool().query<{ user_id: string; score: number; reasons: PqlReason[]; rules_version: string }>(
        "SELECT user_id, score, reasons, rules_version FROM pql_scores WHERE user_id = ANY($1::text[])",
        [batch]
      )
    ).rows;
    const prev = new Map(prevRows.map((r) => [r.user_id, r]));

    const scoreRows: unknown[][] = [];
    const historyRows: unknown[][] = [];
    const stageRows: unknown[][] = [];
    const transitionRows: unknown[][] = [];
    const powerUsers: string[] = [];

    for (const f of facts) {
      const pql = scorePql(f);
      const life = computeLifecycle(f, pql.score);
      const prio = computePriority(f, pql.score, life.stage, now);
      const before = prev.get(f.userId) ?? null;

      scoreRows.push([
        f.userId,
        pql.score,
        pql.category,
        prio.priority,
        prio.trigger,
        prio.reason,
        prio.ownerTeam,
        prio.nextBestAction,
        JSON.stringify(pql.reasons),
        JSON.stringify(f),
        f.isPaid,
        pql.rulesVersion,
      ]);
      if (pqlChanged(before, pql)) {
        historyRows.push([
          f.userId,
          pql.score,
          before?.score ?? null,
          pql.category,
          prio.priority,
          prio.trigger,
          JSON.stringify(pql.reasons),
          pql.rulesVersion,
        ]);
      }

      stageRows.push([f.userId, life.stage, f.previousStage, life.reason]);
      if (f.previousStage !== life.stage) {
        transitionRows.push([f.userId, f.previousStage, life.stage, life.reason]);
      }
      if (life.stage === "power_user") powerUsers.push(f.userId);
    }

    await withTransaction(async (client) => {
      const cols = (rows: unknown[][], i: number) => rows.map((r) => r[i]);

      await client.query(
        `INSERT INTO pql_scores (user_id, score, category, priority, priority_trigger, priority_reason, owner_team,
                                 next_best_action, reasons, facts, is_paid, rules_version, computed_at, updated_at)
         SELECT user_id, score, category, priority, priority_trigger, priority_reason, owner_team, nba,
                reasons::jsonb, facts::jsonb, is_paid, rules_version, $13, now()
         FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                     $9::text[], $10::text[], $11::bool[], $12::text[])
              AS t(user_id, score, category, priority, priority_trigger, priority_reason, owner_team, nba, reasons,
                   facts, is_paid, rules_version)
         ON CONFLICT (user_id) DO UPDATE SET
           score = EXCLUDED.score, category = EXCLUDED.category, priority = EXCLUDED.priority,
           priority_trigger = EXCLUDED.priority_trigger, priority_reason = EXCLUDED.priority_reason,
           owner_team = EXCLUDED.owner_team, next_best_action = EXCLUDED.next_best_action,
           reasons = EXCLUDED.reasons, facts = EXCLUDED.facts, is_paid = EXCLUDED.is_paid,
           rules_version = EXCLUDED.rules_version, computed_at = EXCLUDED.computed_at, updated_at = now()`,
        [...Array.from({ length: 12 }, (_, i) => cols(scoreRows, i)), now]
      );

      if (historyRows.length > 0) {
        await client.query(
          `INSERT INTO pql_score_history (user_id, score, previous_score, category, priority, priority_trigger,
                                          reasons, rules_version, computed_at)
           SELECT user_id, score, previous_score, category, priority, priority_trigger, reasons::jsonb, rules_version, $9
           FROM unnest($1::text[], $2::int[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
                AS t(user_id, score, previous_score, category, priority, priority_trigger, reasons, rules_version)`,
          [...Array.from({ length: 8 }, (_, i) => cols(historyRows, i)), now]
        );
      }

      await client.query(
        `INSERT INTO lifecycle_state (user_id, stage, previous_stage, entered_at, reason, rules_version, updated_at)
         SELECT user_id, stage, previous_stage, $5, reason, $6, now()
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(user_id, stage, previous_stage, reason)
         ON CONFLICT (user_id) DO UPDATE SET
           previous_stage = CASE WHEN lifecycle_state.stage <> EXCLUDED.stage THEN lifecycle_state.stage
                                 ELSE lifecycle_state.previous_stage END,
           entered_at     = CASE WHEN lifecycle_state.stage <> EXCLUDED.stage THEN EXCLUDED.entered_at
                                 ELSE lifecycle_state.entered_at END,
           stage = EXCLUDED.stage, reason = EXCLUDED.reason, rules_version = EXCLUDED.rules_version,
           updated_at = now()`,
        [cols(stageRows, 0), cols(stageRows, 1), cols(stageRows, 2), cols(stageRows, 3), now, LIFECYCLE_RULES_VERSION]
      );

      if (transitionRows.length > 0) {
        await client.query(
          `INSERT INTO lifecycle_history (user_id, from_stage, to_stage, transitioned_at, reason, rules_version)
           SELECT user_id, from_stage, to_stage, $5, reason, $6
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(user_id, from_stage, to_stage, reason)`,
          [
            cols(transitionRows, 0),
            cols(transitionRows, 1),
            cols(transitionRows, 2),
            cols(transitionRows, 3),
            now,
            LIFECYCLE_RULES_VERSION,
          ]
        );
      }

      if (powerUsers.length > 0) {
        await client.query(
          `INSERT INTO user_milestones (user_id, milestone, first_at)
           SELECT unnest($1::text[]), 'lifecycle:power_user', $2
           ON CONFLICT (user_id, milestone) DO NOTHING`,
          [powerUsers, now]
        );
      }
    });

    stats.scored += facts.length;
    stats.score_changes += historyRows.length;
    stats.stage_changes += transitionRows.length;
  }
  return stats;
}

/** Users whose derived inputs changed since `since` (scoring's incremental dirty set). */
export async function usersChangedSince(since: Date, upper: Date): Promise<string[]> {
  const { rows } = await getPool().query<{ user_id: string }>(
    `SELECT user_id FROM users WHERE updated_at > $1 AND updated_at <= $2
     UNION SELECT user_id FROM user_daily_metrics WHERE updated_at > $1 AND updated_at <= $2
     UNION SELECT user_id FROM auto_apply_usage WHERE updated_at > $1 AND updated_at <= $2
     UNION SELECT user_id FROM subscriptions WHERE updated_at > $1 AND updated_at <= $2
     -- time-driven: a checkout is about to cross the abandonment window
     UNION SELECT user_id FROM user_events
           WHERE event_name IN ('checkout_started', 'checkout_abandoned') AND user_id IS NOT NULL
             AND occurred_at > now() - interval '2 hours'`,
    [since, upper]
  );
  return rows.map((r) => r.user_id);
}

export async function allUserIds(): Promise<string[]> {
  const { rows } = await getPool().query<{ user_id: string }>("SELECT user_id FROM users ORDER BY user_id");
  return rows.map((r) => r.user_id);
}
