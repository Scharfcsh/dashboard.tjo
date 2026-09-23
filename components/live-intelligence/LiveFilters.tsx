"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { FilterSelect } from "@/components/layout/FilterSelect";
import { SavedCohorts } from "@/components/live-intelligence/SavedCohorts";
import { cx } from "@/components/ui/tones";
import { INTENT_FILTERS, isDefaultFilters, SEGMENT_FILTERS, SEGMENT_META, type LiveFilterState } from "@/lib/live-intelligence/derive";
import type { FilterOption } from "@/lib/revenue-center/types";

// Widths tuned so the whole bar fits one row at 1440px; roomier at 1536px+.
const W = {
  status: "w-[6.5rem] 2xl:w-[8rem]",
  window: "w-[7rem] 2xl:w-[8rem]",
  recency: "w-[6.75rem] 2xl:w-[8rem]",
  country: "w-[6.5rem] 2xl:w-[8rem]",
  segment: "w-[7.5rem] 2xl:w-[8.5rem]",
  plan: "w-[5rem] 2xl:w-[6.5rem]",
  intent: "w-[5.5rem] 2xl:w-[8rem]",
  pql: "w-[6.5rem] 2xl:w-[7.5rem]",
  source: "w-[6rem] 2xl:w-[9.5rem]",
};

export function LiveFilters({
  filters,
  onChange,
  onReset,
  query,
  searching,
  onSearchStart,
  countryOptions,
  sourceOptions,
  planOptions,
}: {
  filters: LiveFilterState;
  onChange: (patch: Partial<LiveFilterState>) => void;
  onReset: () => void;
  query: string;
  searching: boolean;
  onSearchStart: (run: () => void) => void;
  countryOptions: FilterOption[];
  sourceOptions: FilterOption[];
  planOptions: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(query);
  const first = useRef(true);

  // Search matches email/phone server-side (they are masked in the browser), debounced.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (text.trim()) params.set("q", text.trim());
      else params.delete("q");
      onSearchStart(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(t);
  }, [text, pathname, router, onSearchStart]);

  const dirty = !isDefaultFilters(filters) || text.trim() !== "";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 2xl:gap-2" role="search" aria-label="Filter live users">
      <FilterSelect
        label="Live status"
        value={filters.status}
        onChange={(v) => onChange({ status: v as LiveFilterState["status"] })}
        options={[
          { value: "all", label: "All Users" },
          { value: "online", label: "Online Now" },
          { value: "idle", label: "Idle / Away" },
        ]}
        className={W.status}
      />
      <FilterSelect
        label="Activity window"
        value={filters.window}
        onChange={(v) => onChange({ window: v as LiveFilterState["window"] })}
        options={[
          { value: "today", label: "Active Today" },
          { value: "7d", label: "Last 7 Days" },
        ]}
        className={W.window}
      />
      <FilterSelect
        label="Last activity"
        value={filters.recency}
        onChange={(v) => onChange({ recency: v as LiveFilterState["recency"] })}
        options={[
          { value: "any", label: "Any Time" },
          { value: "15m", label: "Last 15 Min" },
          { value: "1h", label: "Last 1 Hour" },
          { value: "24h", label: "Last 24 Hours" },
        ]}
        className={W.recency}
      />
      <FilterSelect label="Country" value={filters.country} onChange={(v) => onChange({ country: v })} options={[{ value: "", label: "Country" }, ...countryOptions]} className={W.country} />
      <FilterSelect
        label="User segment"
        value={filters.segment}
        onChange={(v) => onChange({ segment: v as LiveFilterState["segment"] })}
        options={[{ value: "", label: "User Segment" }, ...SEGMENT_FILTERS.map((s) => ({ value: s, label: SEGMENT_META[s].label }))]}
        className={W.segment}
      />
      <FilterSelect label="Plan" value={filters.plan} onChange={(v) => onChange({ plan: v })} options={[{ value: "", label: "Plan" }, ...planOptions]} className={W.plan} />
      <FilterSelect
        label="Intent"
        value={filters.intent}
        onChange={(v) => onChange({ intent: v as LiveFilterState["intent"] })}
        options={[{ value: "", label: "Intent" }, ...INTENT_FILTERS.map((i) => ({ value: i.key, label: i.label }))]}
        className={W.intent}
      />
      <FilterSelect
        label="PQL score"
        value={filters.pql}
        onChange={(v) => onChange({ pql: v as LiveFilterState["pql"] })}
        options={[
          { value: "any", label: "PQL Score" },
          { value: "90", label: "90+ (High)" },
          { value: "80", label: "80+" },
          { value: "60-89", label: "60–89 (Medium)" },
          { value: "lt60", label: "Below 60 (Low)" },
        ]}
        className={W.pql}
      />
      <FilterSelect label="Acquisition source" value={filters.source} onChange={(v) => onChange({ source: v })} options={[{ value: "", label: "Source" }, ...sourceOptions]} className={W.source} />

      <div className="ml-auto flex items-center gap-1.5">
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setText("");
              onReset();
            }}
            className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-gray-900"
          >
            <X className="size-3.5" aria-hidden /> Reset
          </button>
        )}
        <SavedCohorts current={filters} onApply={(f) => onChange(f)} canSave={!isDefaultFilters(filters)} />
        <label className="relative">
          <span className="sr-only">Search name, email, phone or User ID</span>
          <Search className={cx("pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2", searching ? "animate-pulse text-brand" : "text-slate-400")} aria-hidden />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search user, email, ID…"
            className="focus-ring h-8 w-40 rounded-lg border border-line bg-white pr-2.5 pl-8 text-xs text-slate-700 shadow-card placeholder:text-slate-400 hover:border-slate-300 2xl:w-64"
          />
        </label>
      </div>
    </div>
  );
}
