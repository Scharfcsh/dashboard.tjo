"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Icon } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx, TONES } from "@/components/ui/tones";
import { formatNumber } from "@/lib/revenue-center/format";
import type { FunnelRange, FunnelStage } from "@/lib/revenue-center/types";

const RANGE_OPTIONS: { value: FunnelRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

const TITLE: Record<FunnelRange, string> = {
  today: "Today's User-to-Revenue Funnel",
  "7d": "7-Day User-to-Revenue Funnel",
  "30d": "30-Day User-to-Revenue Funnel",
};

export function RevenueFunnel({ stages, range }: { stages: FunnelStage[]; range: FunnelRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setRange = (next: FunnelRange) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "today") params.delete("funnel");
    else params.set("funnel", next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  return (
    <SectionCard
      title={TITLE[range]}
      info="Unique users, strictly nested: each stage counts active users who also reached every earlier stage."
      actions={<SegmentedControl label="Funnel period" options={RANGE_OPTIONS} value={range} onChange={setRange} disabled={pending} />}
      bodyClassName={cx("pt-2 pb-3 transition-opacity", pending && "opacity-60")}
    >
      <ol className="flex items-stretch" aria-label="Conversion funnel">
        {stages.map((stage, i) => {
          const tone = TONES[stage.tone];
          return (
            <li key={stage.key} className="flex min-w-0 flex-1 items-stretch">
              {i > 0 && (
                <span className="flex w-6 shrink-0 items-center justify-center" aria-hidden>
                  <ChevronRight className="size-4 text-slate-400" />
                </span>
              )}
              <div
                className={cx("flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg border px-1.5 py-2.5 text-center", tone.tile)}
                title={`${stage.label}: ${stage.count} (ignoring earlier stages: ${stage.independentCount})`}
              >
                <span className={cx("flex min-h-8 items-center text-2xs leading-4 font-medium", tone.tileText)}>{stage.label}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className={cx("inline-flex size-4.5 items-center justify-center rounded-full text-white", tone.solid)}>
                    <Icon name={stage.icon} className="size-2.5" strokeWidth={2.5} />
                  </span>
                  <span className="tabular text-lg leading-6 font-bold text-gray-900">{formatNumber(stage.count)}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {/* Conversion between stages, aligned under the arrow that separates them. */}
      <div className="mt-2 flex" aria-label="Stage conversion rates">
        {stages.map((stage, i) => {
          const prev = stages[i - 1];
          return (
            <div key={stage.key} className="relative flex min-w-0 flex-1">
              {prev && (
                <div className="relative w-6 shrink-0">
                  <Tooltip
                    content={
                      <>
                        {formatNumber(stage.count)} of {formatNumber(prev.count)} ({prev.label}) reached {stage.label}.
                        <br />
                        Drop-off: {formatNumber(prev.count - stage.count)} users
                        {stage.conversionFromPrevious !== null ? ` (${Math.round((100 - stage.conversionFromPrevious) * 10) / 10}%)` : ""}.
                      </>
                    }
                    className="absolute top-0 left-1/2 -translate-x-1/2"
                  >
                    <button type="button" className="focus-ring flex flex-col items-center rounded px-1 text-center leading-tight whitespace-nowrap">
                      <span className="tabular text-xs font-semibold text-gray-800">
                        {stage.conversionFromPrevious === null ? "—" : `${Math.round(stage.conversionFromPrevious)}%`}
                      </span>
                      <span className="text-2xs text-slate-500">converted</span>
                    </button>
                  </Tooltip>
                </div>
              )}
              <div className="flex-1" />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
