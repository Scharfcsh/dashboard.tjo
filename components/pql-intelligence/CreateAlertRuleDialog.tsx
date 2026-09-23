"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { cx } from "@/components/ui/tones";
import { createAlertRuleAction } from "@/app/(dashboard)/pql-leads/actions";
import { USAGE_BOUNDS } from "@/lib/pql-intelligence/filters";
import type { PqlFilters } from "@/lib/pql-intelligence/types";

// Turns the filters already on screen into an automation rule. The rule is
// saved as a draft: it will not fire until someone activates it deliberately.

const SCORE_MIN: Record<PqlFilters["score"], number | null> = { all: null, "40": 40, "60": 60, "75": 75, "90": 90 };

function describe(filters: PqlFilters, usageMin: number | null, scoreMin: number | null, pricingMin: number | null, unassigned: boolean) {
  const parts = ["is not paying"];
  if (usageMin !== null) parts.push(`has used ${usageMin}+ free Auto Applies`);
  if (scoreMin !== null) parts.push(`has a PQL score of ${scoreMin} or more`);
  if (pricingMin !== null) parts.push(`viewed pricing at least ${pricingMin} time${pricingMin === 1 ? "" : "s"} in 30 days`);
  if (unassigned) parts.push("has no open sales lead");
  return `Alerts when a user ${parts.join(", ")}.`;
}

export function CreateAlertRuleDialog({
  filters,
  onClose,
  onDone,
}: {
  filters: PqlFilters;
  onClose: () => void;
  onDone: (message: string, tone: "ok" | "error") => void;
}) {
  const usageMin = USAGE_BOUNDS[filters.usage].min ?? null;
  const scoreMin = SCORE_MIN[filters.score];
  const pricingMin = filters.intent === "viewed" ? 1 : null;
  const unassigned = filters.leadStatus === "unassigned";

  const [name, setName] = useState(
    usageMin !== null ? `Reached ${usageMin}+ Auto Applies` : scoreMin !== null ? `PQL score ${scoreMin}+` : "High-intent free user"
  );
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">("P1");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasCondition = usageMin !== null || scoreMin !== null || pricingMin !== null || unassigned;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await createAlertRuleAction(
        {
          name,
          description: describe(filters, usageMin, scoreMin, pricingMin, unassigned),
          priority,
          sla_minutes: priority === "P0" ? 15 : priority === "P1" ? 480 : 4320,
          usage_min: usageMin,
          score_min: scoreMin,
          pricing_views_min: pricingMin,
          unassigned_only: unassigned,
        },
        false
      );
      if (result.ok) onDone(`Rule “${result.data.name}” saved as a draft — activate it to start alerting.`, "ok");
      else setError(result.error);
    });

  const field = "focus-ring h-8 w-full rounded-lg border border-line bg-white px-2.5 text-xs text-slate-700 shadow-card";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 animate-fade-in cursor-default bg-gray-900/30" />
      <div className="card relative z-10 w-full max-w-md animate-fade-in p-4 shadow-pop">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="rule-dialog-title" className="text-sm font-semibold text-gray-900">Create alert rule</h2>
            <p className="mt-0.5 text-2xs text-slate-500">Built from the filters currently applied to the upgrade queue.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="focus-ring -mt-1 -mr-1 inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {!hasCondition ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Apply at least one filter (usage, PQL score, pricing intent or lead status) first — a rule with no condition
            would alert on every unpaid user.
          </p>
        ) : (
          <>
            <label className="mt-4 block text-2xs font-medium text-slate-600">
              Rule name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={cx(field, "mt-1")} />
            </label>

            <label className="mt-3 block text-2xs font-medium text-slate-600">
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as "P0" | "P1" | "P2")} className={cx(field, "mt-1 cursor-pointer")}>
                <option value="P0">P0 — call within 15 minutes</option>
                <option value="P1">P1 — same day (8 hours)</option>
                <option value="P2">P2 — nurture (3 days)</option>
              </select>
            </label>

            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-2xs leading-4 text-slate-600">
              {describe(filters, usageMin, scoreMin, pricingMin, unassigned)} It raises an alert for the sales team and
              is saved <strong className="font-semibold">inactive</strong> until someone activates it.
            </p>

            {error && <p className="mt-3 text-2xs text-red-600">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="focus-ring inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={pending || name.trim().length === 0} className="focus-ring inline-flex h-8 items-center rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
                {pending ? "Saving…" : "Create draft rule"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
