"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, Globe, RefreshCw } from "lucide-react";
import { FilterSelect } from "@/components/layout/FilterSelect";
import { PageHeader } from "@/components/layout/PageHeader";
import { useNow } from "@/components/ui/Now";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import { RANGE_LABELS } from "@/lib/revenue-center/filters";
import { secondsAgo } from "@/lib/revenue-center/format";
import type { DashboardFilters, FilterOption, SystemStatus } from "@/lib/revenue-center/types";

const STATUS_STYLE: Record<SystemStatus["state"], { pill: string; tone: "green" | "amber" }> = {
  operational: { pill: "bg-emerald-50 text-emerald-700", tone: "green" },
  delayed: { pill: "bg-amber-50 text-amber-700", tone: "amber" },
  demo: { pill: "bg-amber-50 text-amber-700", tone: "amber" },
};

export function Header({
  title,
  subtitle,
  filters,
  status,
  generatedAt,
  countryOptions,
  sourceOptions,
}: {
  title: string;
  subtitle: string;
  filters: DashboardFilters;
  status: SystemStatus;
  generatedAt: string;
  countryOptions: FilterOption[];
  sourceOptions: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow();
  const [pending, startTransition] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const refresh = () => startTransition(() => router.refresh());
  const style = STATUS_STYLE[status.state];

  return (
    <PageHeader title={title} subtitle={subtitle}>

      <div className="flex flex-wrap items-center gap-2 wide:shrink-0 wide:flex-nowrap" aria-busy={pending}>
        <Tooltip content={`${status.detail}. Updated ${secondsAgo(generatedAt, now)}.`} side="bottom">
          <span tabIndex={0} className={cx("focus-ring inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium", style.pill)}>
            <StatusDot tone={style.tone} pulse={status.state === "operational"} />
            {status.label}
          </span>
        </Tooltip>
        <span className="tabular hidden px-0.5 text-2xs whitespace-nowrap text-slate-500 2xl:inline" aria-live="polite">
          Updated {secondsAgo(generatedAt, now)}
        </span>

        <FilterSelect
          label="Date range"
          icon={CalendarDays}
          value={filters.range}
          onChange={(v) => setParam("range", v === "today" ? null : v)}
          options={Object.entries(RANGE_LABELS).map(([value, label]) => ({ value, label }))}
          className="w-[8.5rem] 2xl:w-[9.5rem]"
        />
        <FilterSelect
          label="Country"
          icon={Globe}
          value={filters.country ?? ""}
          onChange={(v) => setParam("country", v || null)}
          options={[{ value: "", label: "All Countries" }, ...countryOptions]}
          className="w-[8.5rem] 2xl:w-[9.5rem]"
        />
        <FilterSelect
          label="Acquisition source"
          icon={BarChart3}
          value={filters.source ?? ""}
          onChange={(v) => setParam("source", v || null)}
          options={[{ value: "", label: "All Sources" }, ...sourceOptions]}
          className="w-[8.5rem] 2xl:w-[9.5rem]"
        />
        <Tooltip content="Refresh data" side="bottom" align="end">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            aria-label="Refresh data"
            className="focus-ring inline-flex size-8 items-center justify-center rounded-lg border border-line bg-white text-slate-600 shadow-card transition-colors hover:bg-slate-50 hover:text-gray-900 active:scale-95"
          >
            <RefreshCw className={cx("size-3.5", pending && "animate-spin")} aria-hidden />
          </button>
        </Tooltip>
      </div>
    </PageHeader>
  );
}
