import type { UserFacts } from "@/lib/scoring/facts";
import { PQL_CATEGORIES, PQL_RULES, PQL_RULES_VERSION, type PqlCategory } from "@/lib/scoring/pql-config";

export interface PqlReason {
  rule_id: string;
  label: string;
  points: number;
}

export interface PqlResult {
  score: number;
  category: PqlCategory;
  reasons: PqlReason[];
  rulesVersion: string;
}

export function categoryFor(score: number): PqlCategory {
  return (PQL_CATEGORIES.find((c) => score >= c.min) ?? PQL_CATEGORIES[PQL_CATEGORIES.length - 1]!).category;
}

/** Score = sum of matching rule points, clamped to 0..100. Reasons explain every point. */
export function scorePql(facts: UserFacts): PqlResult {
  const reasons: PqlReason[] = PQL_RULES.filter((r) => r.when(facts)).map((r) => ({
    rule_id: r.id,
    label: r.label,
    points: r.points,
  }));
  const raw = reasons.reduce((sum, r) => sum + r.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  // Biggest contributors first - that is the order a caller reads "why".
  reasons.sort((a, b) => b.points - a.points || a.rule_id.localeCompare(b.rule_id));
  return { score, category: categoryFor(score), reasons, rulesVersion: PQL_RULES_VERSION };
}

/** Whether a new result differs enough from the stored one to deserve a history row. */
export function pqlChanged(
  prev: { score: number; reasons: PqlReason[]; rules_version: string } | null,
  next: PqlResult
): boolean {
  if (!prev) return true;
  if (prev.score !== next.score || prev.rules_version !== next.rulesVersion) return true;
  const key = (rs: PqlReason[]) =>
    rs
      .map((r) => `${r.rule_id}:${r.points}`)
      .sort()
      .join("|");
  return key(prev.reasons) !== key(next.reasons);
}
