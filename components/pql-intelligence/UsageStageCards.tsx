"use client";

import { SectionCard } from "@/components/dashboard/SectionCard";
import { Icon } from "@/components/ui/Icon";
import { cx, TONES } from "@/components/ui/tones";
import { useFilterPatch } from "@/components/pql-intelligence/useFilterPatch";
import { formatNumber, formatPercent } from "@/lib/revenue-center/format";
import type { PqlFilters, UsageStageCard } from "@/lib/pql-intelligence/types";

// The 50-free-Auto-Apply ladder. Usage comes from the auto_apply_usage ledger,
// never a UI counter, and paid users are excluded - these are upgrade
// opportunities, not customers.

export function UsageStageCards({
  stages,
  usersWithUsage,
  filters,
}: {
  stages: UsageStageCard[];
  usersWithUsage: number;
  filters: PqlFilters;
}) {
  const { apply, isActive, pending } = useFilterPatch(filters);

  return (
    <SectionCard
      title="Auto Apply Usage Stages"
      info={`Unpaid users bucketed by free Auto Applies consumed, from the usage ledger. ${formatNumber(usersWithUsage)} users have started at least one. Current state — it does not move with the date range.`}
      bodyClassName={cx("min-h-0 flex-1 px-4 pb-4 transition-opacity", pending && "opacity-60")}
    >
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 wide:grid-cols-6">
        {stages.map((s) => {
          const tone = TONES[s.tone];
          const active = isActive({ usage: s.usage });
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => apply({ usage: s.usage }, "upgrade-leads")}
                aria-pressed={active}
                className={cx(
                  "focus-ring card flex w-full flex-col px-3 py-2.5 text-left transition-all",
                  "hover:border-slate-300 hover:shadow-[0_4px_12px_-4px_rgb(15_23_42/0.12)] active:scale-[0.995]",
                  active && "border-brand ring-1 ring-brand/30"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-md", tone.soft)}>
                    <Icon name={s.icon} className={cx("size-3", tone.text)} />
                  </span>
                  <span className="truncate text-2xs font-medium text-slate-600">{s.title}</span>
                </span>
                <span className="tabular mt-1 text-kpi leading-8 font-bold tracking-tight text-gray-900">
                  {formatNumber(s.users)}
                </span>
                <span className={cx("truncate text-2xs font-medium", tone.softText)} title={s.label}>
                  {s.label}
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <span className="tabular w-7 shrink-0 text-2xs text-slate-500">{formatPercent(s.sharePct, 0)}</span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className={cx("block h-full rounded-full", tone.solid)}
                      style={{ width: `${Math.max(s.sharePct ?? 0, s.users > 0 ? 2 : 0)}%` }}
                    />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
