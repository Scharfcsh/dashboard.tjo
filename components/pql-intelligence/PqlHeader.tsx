"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleUser, Crosshair, Gauge, Globe, RefreshCw, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { FilterSelect } from "@/components/layout/FilterSelect";
import { PageHeader } from "@/components/layout/PageHeader";
import { useNow } from "@/components/ui/Now";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import {
  INTENT_LABELS,
  LEAD_STATUS_LABELS,
  RANGE_LABELS,
  SCORE_LABELS,
  USAGE_LABELS,
} from "@/lib/pql-intelligence/filters";
import type { PqlFilters, PqlRange } from "@/lib/pql-intelligence/types";
import { secondsAgo } from "@/lib/revenue-center/format";
import type { FilterOption, SystemStatus } from "@/lib/revenue-center/types";

const STATUS_STYLE: Record<SystemStatus["state"], { pill: string; tone: "green" | "amber" }> = {
  operational: { pill: "bg-emerald-50 text-emerald-700", tone: "green" },
  delayed: { pill: "bg-amber-50 text-amber-700", tone: "amber" },
  demo: { pill: "bg-amber-50 text-amber-700", tone: "amber" },
};

const options = (labels: Record<string, string>, allValue = "all") =>
  Object.entries(labels).map(([value, label]) => ({ value: value === allValue ? "" : value, label }));

export function PqlHeader({
  filters,
  status,
  generatedAt,
  countryOptions,
  ownerOptions,
}: {
  filters: PqlFilters;
  status: SystemStatus;
  generatedAt: string;
  countryOptions: FilterOption[];
  ownerOptions: FilterOption[];
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

  const style = STATUS_STYLE[status.state];
  const selectWidth = "w-[8.75rem] 2xl:w-[9.75rem]";

  return (
    <PageHeader
      title="PQL & Auto Apply Intelligence"
      subtitle="Identify users who have received product value and are most likely to upgrade."
    >
      <div className="flex flex-col gap-2 wide:items-end" aria-busy={pending}>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Cohort window"
            value={filters.range}
            onChange={(v: PqlRange) => setParam("range", v === "30d" ? null : v)}
            options={(Object.keys(RANGE_LABELS) as PqlRange[]).map((value) => ({ value, label: RANGE_LABELS[value] }))}
          />
          <Tooltip content={`${status.detail}. Updated ${secondsAgo(generatedAt, now)}.`} side="bottom">
            <span
              tabIndex={0}
              className={cx(
                "focus-ring inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium",
                style.pill
              )}
            >
              <StatusDot tone={style.tone} pulse={status.state === "operational"} />
              {status.label}
            </span>
          </Tooltip>
          <span className="tabular hidden px-0.5 text-2xs whitespace-nowrap text-slate-500 2xl:inline" aria-live="polite">
            Updated {secondsAgo(generatedAt, now)}
          </span>
          <Tooltip content="Refresh data" side="bottom" align="end">
            <button
              type="button"
              onClick={() => startTransition(() => router.refresh())}
              disabled={pending}
              aria-label="Refresh data"
              className="focus-ring inline-flex size-8 items-center justify-center rounded-lg border border-line bg-white text-slate-600 shadow-card transition-colors hover:bg-slate-50 hover:text-gray-900 active:scale-95"
            >
              <RefreshCw className={cx("size-3.5", pending && "animate-spin")} aria-hidden />
            </button>
          </Tooltip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Country"
            icon={Globe}
            value={filters.country ?? ""}
            onChange={(v) => setParam("country", v || null)}
            options={[{ value: "", label: "All Countries" }, ...countryOptions]}
            className={selectWidth}
          />
          <FilterSelect
            label="Usage range"
            icon={SlidersHorizontal}
            value={filters.usage === "all" ? "" : filters.usage}
            onChange={(v) => setParam("usage", v || null)}
            options={options(USAGE_LABELS)}
            className={selectWidth}
          />
          <FilterSelect
            label="PQL score"
            icon={Gauge}
            value={filters.score === "all" ? "" : filters.score}
            onChange={(v) => setParam("score", v || null)}
            options={options(SCORE_LABELS)}
            className={selectWidth}
          />
          <FilterSelect
            label="Pricing intent"
            icon={ShoppingCart}
            value={filters.intent === "all" ? "" : filters.intent}
            onChange={(v) => setParam("intent", v || null)}
            options={options(INTENT_LABELS)}
            className={selectWidth}
          />
          <FilterSelect
            label="Sales owner"
            icon={CircleUser}
            value={filters.owner ?? ""}
            onChange={(v) => setParam("owner", v || null)}
            options={[{ value: "", label: "All Owners" }, ...ownerOptions]}
            className={selectWidth}
          />
          <FilterSelect
            label="Lead status"
            icon={Crosshair}
            value={filters.leadStatus === "all" ? "" : filters.leadStatus}
            onChange={(v) => setParam("lead_status", v || null)}
            options={options(LEAD_STATUS_LABELS)}
            className={selectWidth}
          />
        </div>
      </div>
    </PageHeader>
  );
}
