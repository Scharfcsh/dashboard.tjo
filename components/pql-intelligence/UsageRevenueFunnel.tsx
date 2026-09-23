import { ChevronRight, TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx, TONES } from "@/components/ui/tones";
import { formatNumber, formatPercent } from "@/lib/revenue-center/format";
import { RANGE_LABELS } from "@/lib/pql-intelligence/filters";
import type { MonetizationStage, PqlRange } from "@/lib/pql-intelligence/types";

// Nine nested stages: each counts cohort users who reached it *and* every
// earlier one, so the funnel can only narrow. The widest single leak is marked.

export function UsageRevenueFunnel({
  stages,
  biggestDropLabel,
  range,
}: {
  stages: MonetizationStage[];
  biggestDropLabel: string | null;
  range: PqlRange;
}) {
  const start = stages[0]?.users ?? 0;

  return (
    <SectionCard
      title="Free Usage → Revenue Funnel"
      info={`Users whose first Auto Apply falls in the selected window (${RANGE_LABELS[range]}); later stages count them whenever they got there. Each stage requires every earlier one.`}
      actions={
        biggestDropLabel ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-2xs font-medium text-red-700">
            <TriangleAlert className="size-3" aria-hidden />
            Biggest drop-off: {biggestDropLabel}
          </span>
        ) : null
      }
      bodyClassName="min-h-0 flex-1 overflow-x-auto px-4 pb-4"
    >
      <ol className="flex min-w-[52rem] items-stretch">
        {stages.map((s, i) => {
          const tone = TONES[s.tone];
          return (
            <li key={s.key} className="contents">
              {i > 0 && (
                <div className="flex w-6 shrink-0 flex-col items-center justify-center gap-1 pt-1">
                  <ChevronRight className="size-3.5 text-slate-300" aria-hidden />
                  {s.dropFromPrevious !== null && (
                    <Tooltip
                      content={`${formatNumber(stages[i - 1]!.users - s.users)} of ${formatNumber(stages[i - 1]!.users)} users did not reach ${s.label}.`}
                    >
                      <span
                        tabIndex={0}
                        className={cx(
                          "focus-ring tabular rounded px-0.5 text-[0.625rem] font-semibold",
                          s.isBiggestDrop ? "text-red-600" : "text-slate-400"
                        )}
                      >
                        {formatPercent(s.dropFromPrevious, 0)}
                      </span>
                    </Tooltip>
                  )}
                </div>
              )}
              <div
                className={cx(
                  "flex min-w-0 flex-1 flex-col items-center rounded-lg border px-1.5 py-2.5 text-center",
                  tone.tile,
                  s.isBiggestDrop && "ring-2 ring-red-300"
                )}
              >
                <span className={cx("flex min-h-8 items-center text-[0.6875rem] leading-4 font-medium", tone.tileText)}>
                  {s.label}
                </span>
                <span className="mt-1 flex items-center gap-1.5">
                  <span className={cx("inline-flex size-4.5 items-center justify-center rounded-full", tone.solid)}>
                    <Icon name={s.icon} className="size-2.5 text-white" />
                  </span>
                  <span className="tabular text-lg leading-6 font-bold text-gray-900">{formatNumber(s.users)}</span>
                </span>
                <Tooltip content={`${formatPercent(s.conversionFromStart, 1)} of the ${formatNumber(start)} users who started Auto Apply.`}>
                  <span tabIndex={0} className="focus-ring tabular mt-1 rounded text-2xs font-medium text-slate-500">
                    {formatPercent(s.conversionFromStart, s.conversionFromStart !== null && s.conversionFromStart < 10 ? 1 : 0)}
                  </span>
                </Tooltip>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
