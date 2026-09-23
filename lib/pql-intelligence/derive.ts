import type { CheckoutStatus, Tone } from "@/lib/revenue-center/types";
import type { ExperimentVariantView, LeadAction, UpgradeLead, UsageBand } from "@/lib/pql-intelligence/types";

// Pure derivations for Dashboard 4. No database, no React - so the numbers on
// the page can be unit-tested directly.

/**
 * The only definition of "remaining". Floored at zero so a 50/50 user always
 * reads 0, even if a reported usage count briefly exceeds the limit (SOP 11
 * acceptance: 50/50 and remaining can never disagree).
 */
export const remaining = (used: number, limit: number): number => Math.max(0, limit - used);

/** Tabs on the "near their free limit" panel, and the thresholds the API accepts. */
export const NEAR_LIMIT_TABS = [40, 45, 48, 49, 50] as const;

/** Which usage stage card a user belongs to. Mirrors USAGE_STAGES in SQL. */
export function usageBandOf(used: number, limit = 50): UsageBand {
  if (used >= limit) return "50";
  if (used >= 45) return "45-49";
  if (used >= 40) return "40-44";
  if (used >= 26) return "26-39";
  if (used >= 11) return "11-25";
  return "0-10";
}

/** Successful Auto Applies as a share of attempts. Null when nothing was attempted. */
export const successRate = (success: number, started: number): number | null =>
  started <= 0 ? null : Math.round((success / started) * 1000) / 10;

const CHECKOUT_PRESENTATION: Record<CheckoutStatus, { label: string; tone: Tone }> = {
  abandoned: { label: "Abandoned", tone: "red" },
  started: { label: "Started", tone: "amber" },
  plan_selected: { label: "Plan selected", tone: "blue" },
  not_started: { label: "Not started", tone: "slate" },
};

export const checkoutPresentation = (status: string) =>
  CHECKOUT_PRESENTATION[status as CheckoutStatus] ?? CHECKOUT_PRESENTATION.not_started;

/**
 * The single call-to-action on a lead row. Payment and checkout recovery are
 * their own action because they go to revenue recovery, not to a sales pitch.
 */
export function leadAction(nextBestAction: string | null, priority: string | null): LeadAction {
  if (nextBestAction === "payment_recovery" || nextBestAction === "checkout_recovery") return "recover";
  if (nextBestAction === "call_now" || priority === "P0") return "call_now";
  if (priority === "P1") return "contact";
  return "follow_up";
}

export const experimentStatusLabel = (status: string): string =>
  status === "running" ? "Running" : status === "completed" ? "Completed" : status === "draft" ? "Draft" : "Archived";

/**
 * The arm a compact experiment card should headline: the non-control variant
 * with the highest conversion. Null when there is nothing to compare.
 */
export function bestVariant(variants: ExperimentVariantView[]): ExperimentVariantView | null {
  const arms = variants.filter((v) => !v.isControl && v.conversionPct !== null);
  if (arms.length === 0) return null;
  return arms.reduce((best, v) => (v.conversionPct! > best.conversionPct! ? v : best));
}

const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? "" : String(value);
  // Escape quotes, and quote anything containing a delimiter, quote or newline.
  // A leading =, +, - or @ is prefixed with ' so spreadsheets do not execute it.
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /["\n\r,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

export const CSV_COLUMNS = [
  "priority",
  "user_id",
  "name",
  "country",
  "auto_applies_used",
  "auto_apply_limit",
  "remaining",
  "success_rate_pct",
  "pricing_views",
  "plan_clicked",
  "checkout",
  "pql_score",
  "lead_reason",
  "owner",
  "last_active_at",
] as const;

/** Lead rows as CSV. Email and phone are deliberately absent - see the export action. */
export function leadsToCsv(rows: UpgradeLead[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.priority ?? "",
        r.userId,
        r.name,
        r.country ?? "",
        r.autoApplyUsed,
        r.autoApplyLimit,
        r.remaining,
        r.successRatePct ?? "",
        r.pricingViews,
        r.planClicked ?? "",
        r.checkoutLabel,
        r.pqlScore,
        r.reason,
        r.ownerName ?? "",
        r.lastActiveAt ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}
