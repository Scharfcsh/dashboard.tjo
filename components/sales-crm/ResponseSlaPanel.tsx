"use client";

import { Clock, TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx, TONES } from "@/components/ui/tones";
import type { SlaMetric } from "@/lib/sales-crm/types";

// Manager view. The one control that writes anything lives here, because an
// unassigned hot lead is the problem a manager can actually fix.

export function ResponseSlaPanel({
  metrics,
  unassignedOpenLeads,
  demo,
  busy,
  onAssign,
}: {
  metrics: SlaMetric[];
  unassignedOpenLeads: number;
  demo: boolean;
  busy: boolean;
  onAssign: () => void;
}) {
  return (
    <SectionCard
      title="Response SLA"
      info="P0 leads must be contacted within 15 minutes, P1 within 8 hours. First response is the gap between a lead being created and its first contact."
    >
      <ul className="space-y-2">
        {metrics.map((m) => (
          <li key={m.key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cx("inline-flex size-6 shrink-0 items-center justify-center rounded-lg", TONES[m.tone].soft)}>
                {m.tone === "red" ? (
                  <TriangleAlert className={cx("size-3.5", TONES[m.tone].text)} aria-hidden />
                ) : (
                  <Clock className={cx("size-3.5", TONES[m.tone].text)} aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className="tabular block text-sm leading-5 font-bold text-gray-900">{m.value}</span>
                <span className="block truncate text-2xs text-slate-500" title={m.label}>
                  {m.label}
                </span>
              </span>
            </span>
            {m.callToAction ? (
              <span className={cx("shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium", TONES[m.tone].soft, TONES[m.tone].softText)}>
                {m.callToAction}
              </span>
            ) : (
              m.target && <span className="shrink-0 text-2xs text-slate-400">{m.target}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-lg border border-line bg-slate-50 px-2.5 py-2">
        <p className="text-2xs text-slate-600">
          {unassignedOpenLeads > 0
            ? `${unassignedOpenLeads} open ${unassignedOpenLeads === 1 ? "lead has" : "leads have"} no owner. Round robin spreads them across active callers by spare capacity.`
            : "Every open lead has an owner."}
        </p>
        {demo ? (
          <Tooltip content="Assigning leads is disabled while showing demo data." side="top">
            <span tabIndex={0} className="focus-ring mt-2 inline-flex rounded-lg">
              <span
                aria-disabled="true"
                className="inline-flex h-8 cursor-not-allowed items-center rounded-lg bg-brand/40 px-3 text-xs font-semibold text-white"
              >
                Assign unassigned leads
              </span>
            </span>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={onAssign}
            disabled={busy || unassignedOpenLeads === 0}
            className="focus-ring mt-2 inline-flex h-8 items-center rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Assigning…" : "Assign unassigned leads"}
          </button>
        )}
      </div>
    </SectionCard>
  );
}
