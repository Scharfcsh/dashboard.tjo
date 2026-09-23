"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bell, RefreshCw, UserRound } from "lucide-react";
import { FilterSelect } from "@/components/layout/FilterSelect";
import { Avatar } from "@/components/ui/Avatar";
import { useNow } from "@/components/ui/Now";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import { greeting, RANGE_LABELS } from "@/lib/sales-crm/derive";
import type { CallerIdentity, SalesRange } from "@/lib/sales-crm/types";
import type { FilterOption } from "@/lib/revenue-center/types";

// The caller switcher stands in for sign-in, which does not exist yet: it sets
// whose queue the whole page shows. Availability is read-only - it reflects
// team_members.active, which is managed outside this dashboard.

export function SalesHeader({
  caller,
  callerOptions,
  range,
  openAlerts,
}: {
  caller: CallerIdentity;
  callerOptions: FilterOption[];
  range: SalesRange;
  openAlerts: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow();
  const [pending, startTransition] = useTransition();

  const setParam = (key: string, value: string | null, clearLead = false) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // A lead belongs to one caller's queue, so switching caller drops it.
    if (clearLead) params.delete("lead");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  return (
    <header className="flex flex-col gap-3 pb-4 wide:flex-row wide:items-center wide:justify-between" aria-busy={pending}>
      <div className="min-w-0">
        <h1 className="text-[1.375rem] leading-7 font-semibold tracking-tight text-gray-900">Sales Command Center</h1>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          <span className="font-medium text-slate-700">
            {greeting(now)}, {caller.name.split(" ")[0]}
          </span>{" "}
          — your highest-intent TopJobOffer users are ready for follow-up.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 wide:shrink-0 wide:flex-nowrap">
        <Tooltip
          content={
            caller.active
              ? "Accepting new leads. Availability is set in team settings, not here."
              : "Not accepting new leads. Availability is set in team settings, not here."
          }
          side="bottom"
        >
          <span
            tabIndex={0}
            className={cx(
              "focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-2xs font-medium",
              caller.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
            )}
          >
            <StatusDot tone={caller.active ? "green" : "slate"} pulse={caller.active} />
            {caller.active ? "Online" : "Offline"}
          </span>
        </Tooltip>

        <FilterSelect
          label="Caller"
          icon={UserRound}
          value={caller.id}
          onChange={(v) => setParam("caller", v, true)}
          options={callerOptions}
          className="w-[10.5rem]"
        />

        <SegmentedControl
          label="Range"
          value={range}
          onChange={(v: SalesRange) => setParam("range", v === "today" ? null : v)}
          options={(Object.keys(RANGE_LABELS) as SalesRange[]).map((value) => ({ value, label: RANGE_LABELS[value] }))}
        />

        <Tooltip content={`${openAlerts} open sales ${openAlerts === 1 ? "alert" : "alerts"}`} side="bottom">
          <Link
            href="/alerts"
            aria-label={`${openAlerts} open sales alerts`}
            className="focus-ring relative inline-flex size-8 items-center justify-center rounded-lg border border-line bg-white text-slate-600 shadow-card hover:bg-slate-50 hover:text-gray-900"
          >
            <Bell className="size-3.5" aria-hidden />
            {openAlerts > 0 && (
              <span className="tabular absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.625rem] leading-4 font-semibold text-white">
                {openAlerts > 99 ? "99+" : openAlerts}
              </span>
            )}
          </Link>
        </Tooltip>

        <Tooltip content="Refresh" side="bottom" align="end">
          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            disabled={pending}
            aria-label="Refresh"
            className="focus-ring inline-flex size-8 items-center justify-center rounded-lg border border-line bg-white text-slate-600 shadow-card transition-colors hover:bg-slate-50 hover:text-gray-900 active:scale-95"
          >
            <RefreshCw className={cx("size-3.5", pending && "animate-spin")} aria-hidden />
          </button>
        </Tooltip>

        <span className="flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-1 shadow-card">
          <Avatar name={caller.name} size="sm" />
          <span className="hidden min-w-0 flex-col leading-tight 2xl:flex">
            <span className="truncate text-2xs font-semibold text-gray-900">{caller.name}</span>
            <span className="truncate text-[0.625rem] text-slate-500">{caller.roleLabel}</span>
          </span>
        </span>
      </div>
    </header>
  );
}
