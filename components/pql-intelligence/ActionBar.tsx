"use client";

import { useState, useTransition } from "react";
import { BellPlus, Download, Send, Sparkles, UserPlus } from "lucide-react";
import { CreateAlertRuleDialog } from "@/components/pql-intelligence/CreateAlertRuleDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import { exportCohortAction } from "@/app/(dashboard)/pql-leads/actions";
import { activeLeadFilterCount } from "@/lib/pql-intelligence/filters";
import type { PqlFilters } from "@/lib/pql-intelligence/types";
import { formatNumber } from "@/lib/revenue-center/format";

// Sticky action bar. Only the two actions this service can honestly perform
// write anything; the rest say plainly why they are unavailable rather than
// pretending to work.

const UNAVAILABLE: { label: string; icon: typeof Send; reason: string }[] = [
  {
    label: "Assign all P0 leads",
    icon: UserPlus,
    reason: "Bulk assignment is not enabled here — assign owners one at a time from a lead's profile.",
  },
  {
    label: "Send upgrade campaign",
    icon: Send,
    reason: "No messaging provider is connected, so campaign sends would be recorded and never delivered.",
  },
  {
    label: "Create sales queue",
    icon: Sparkles,
    reason: "Queue creation is not enabled here — it would create a lead for every matching user in one click.",
  },
];

export function ActionBar({ filters, leadCount, demo }: { filters: PqlFilters; leadCount: number; demo: boolean }) {
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const activeFilters = activeLeadFilterCount(filters);

  const show = (text: string, tone: "ok" | "error") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 4000);
  };

  const exportCsv = () =>
    startTransition(async () => {
      const params: Record<string, string> = {
        range: filters.range,
        usage: filters.usage,
        score: filters.score,
        intent: filters.intent,
        lead_status: filters.leadStatus,
        near_limit: String(filters.nearLimit),
      };
      if (filters.country) params.country = filters.country;
      if (filters.owner) params.owner = filters.owner;

      const result = await exportCohortAction(params);
      if (!result.ok) {
        show(result.error, "error");
        return;
      }
      const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename;
      link.click();
      URL.revokeObjectURL(url);
      show(`Exported ${formatNumber(result.data.rows)} leads. Contact details are not included.`, "ok");
    });

  const button =
    "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed";

  return (
    <>
      <div className="card sticky bottom-3 z-30 flex flex-wrap items-center gap-2 px-3 py-2.5 shadow-pop">
        <span className="tabular mr-auto pl-1 text-2xs text-slate-500">
          {formatNumber(leadCount)} lead{leadCount === 1 ? "" : "s"} in view
          {activeFilters > 0 && ` · ${activeFilters} filter${activeFilters === 1 ? "" : "s"} applied`}
        </span>

        {UNAVAILABLE.map((a) => (
          <Tooltip key={a.label} content={a.reason} side="top" align="center">
            <span tabIndex={0} className="focus-ring inline-flex rounded-lg">
              <span
                aria-disabled="true"
                className={cx(button, "border border-line bg-slate-50 text-slate-400")}
              >
                <a.icon className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{a.label}</span>
              </span>
            </span>
          </Tooltip>
        ))}

        <button type="button" onClick={exportCsv} disabled={pending} className={cx(button, "border border-line bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60")}>
          <Download className="size-3.5" aria-hidden />
          Export cohort
        </button>

        {demo ? (
          <Tooltip content="Creating rules is disabled while showing demo data." side="top" align="end">
            <span tabIndex={0} className="focus-ring inline-flex rounded-lg">
              <span aria-disabled="true" className={cx(button, "bg-brand/40 text-white")}>
                <BellPlus className="size-3.5" aria-hidden />
                Create alert rule
              </span>
            </span>
          </Tooltip>
        ) : (
          <button type="button" onClick={() => setDialogOpen(true)} className={cx(button, "bg-brand text-white hover:bg-brand-strong")}>
            <BellPlus className="size-3.5" aria-hidden />
            Create alert rule
          </button>
        )}
      </div>

      {dialogOpen && (
        <CreateAlertRuleDialog
          filters={filters}
          onClose={() => setDialogOpen(false)}
          onDone={(message, tone) => {
            setDialogOpen(false);
            show(message, tone);
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed right-5 bottom-5 z-[70] animate-fade-in rounded-lg px-3.5 py-2.5 text-xs font-medium shadow-pop",
            toast.tone === "ok" ? "bg-gray-900 text-white" : "bg-red-600 text-white"
          )}
        >
          {toast.text}
        </div>
      )}
    </>
  );
}
