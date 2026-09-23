"use client";

import { SectionCard } from "@/components/dashboard/SectionCard";
import { Icon } from "@/components/ui/Icon";
import { cx, TONES } from "@/components/ui/tones";
import { useFilterPatch } from "@/components/pql-intelligence/useFilterPatch";
import { formatNumber } from "@/lib/revenue-center/format";
import type { CriticalSignalCard, PqlFilters } from "@/lib/pql-intelligence/types";

// Six counts worth acting on today. Every one except "Converted After Limit"
// counts unpaid users only.

export function CriticalSignalCards({ signals, filters }: { signals: CriticalSignalCard[]; filters: PqlFilters }) {
  const { apply, isActive, pending } = useFilterPatch(filters);

  return (
    <SectionCard
      title="Critical Revenue Signals"
      info="Users who need an action now. Click a card to narrow the upgrade queue below to exactly those users; click it again to clear."
      bodyClassName={cx("min-h-0 flex-1 px-4 pb-4 transition-opacity", pending && "opacity-60")}
    >
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 wide:grid-cols-6">
        {signals.map((s) => {
          const tone = TONES[s.tone];
          const active = s.filter !== null && isActive(s.filter);
          const body = (
            <>
              <span className="flex items-start gap-2">
                <span className={cx("inline-flex size-6 shrink-0 items-center justify-center rounded-lg", tone.soft)}>
                  <Icon name={s.icon} className={cx("size-3.5", tone.text)} />
                </span>
                <span className="min-w-0 text-2xs leading-4 font-medium text-slate-700">{s.title}</span>
              </span>
              <span className="tabular mt-1 text-2xl leading-7 font-bold tracking-tight text-gray-900">
                {formatNumber(s.value)}
              </span>
              <span className="truncate text-2xs text-slate-500" title={s.caption}>
                {s.caption}
              </span>
            </>
          );
          const shell = cx("flex w-full flex-col rounded-xl border px-3 py-2.5 text-left", tone.tile);
          return (
            <li key={s.key}>
              {s.filter === null ? (
                <div className={shell}>{body}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => apply(s.filter!, "upgrade-leads")}
                  aria-pressed={active}
                  className={cx(
                    shell,
                    "focus-ring transition-all hover:shadow-[0_4px_12px_-4px_rgb(15_23_42/0.12)] active:scale-[0.995]",
                    active && "ring-2 ring-brand/40"
                  )}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
