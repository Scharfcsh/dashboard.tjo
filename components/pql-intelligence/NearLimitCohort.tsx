"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { useFilterPatch } from "@/components/pql-intelligence/useFilterPatch";
import { UsageRing } from "@/components/pql-intelligence/UsageRing";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useNow } from "@/components/ui/Now";
import { cx } from "@/components/ui/tones";
import { NEAR_LIMIT_TABS } from "@/lib/pql-intelligence/derive";
import type { NearLimitUser, PqlFilters } from "@/lib/pql-intelligence/types";
import { formatNumber, relativeTime } from "@/lib/revenue-center/format";

// The users about to lose access to the product's core value. One card each,
// with the usage ring first because that is the thing to act on.

export function NearLimitCohort({
  users,
  total,
  filters,
}: {
  users: NearLimitUser[];
  total: number;
  filters: PqlFilters;
}) {
  const now = useNow();
  const { apply, pending } = useFilterPatch(filters);

  return (
    <SectionCard
      title="Users Near Their Free Limit"
      info="Unpaid users at or past the selected number of free Auto Applies, most urgent first (routing priority, then PQL score, then usage)."
      actions={
        <span className="flex items-center gap-2">
          <span className="tabular hidden text-2xs whitespace-nowrap text-slate-500 sm:inline">
            {formatNumber(total)} user{total === 1 ? "" : "s"}
          </span>
          <span role="tablist" aria-label="Usage threshold" className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {NEAR_LIMIT_TABS.map((t) => {
              const active = filters.nearLimit === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => apply({ nearLimit: t })}
                  className={cx(
                    "focus-ring rounded-md px-2 py-0.5 text-2xs font-medium transition-colors",
                    active ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:text-gray-900"
                  )}
                >
                  {t === 50 ? "50/50" : `${t}+`}
                </button>
              );
            })}
          </span>
        </span>
      }
      bodyClassName={cx("min-h-0 flex-1 px-4 pb-4 transition-opacity", pending && "opacity-60")}
    >
      {users.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-500">
          No unpaid users have reached {filters.nearLimit} free Auto Applies.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 wide:grid-cols-3">
          {users.map((u) => (
            <li key={u.userId} className="card flex min-w-0 items-center gap-2.5 px-2.5 py-2.5">
              <UsageRing used={u.autoApplyUsed} limit={u.autoApplyLimit} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Avatar name={u.name} size="sm" />
                  <span className="truncate text-xs font-semibold text-gray-900" title={u.name}>
                    {u.name}
                  </span>
                  {u.priority && (
                    <Badge tone={u.priority === "P0" ? "red" : u.priority === "P1" ? "amber" : "slate"} size="sm">
                      {u.priority}
                    </Badge>
                  )}
                </div>
                <p className="tabular mt-0.5 text-2xs text-slate-500">
                  {u.autoApplyUsed}/{u.autoApplyLimit} used · {relativeTime(u.lastActiveAt, now)}
                </p>
                <Link
                  href={`/user-intelligence/${encodeURIComponent(u.userId)}`}
                  className="focus-ring mt-1 inline-flex items-center gap-1 rounded text-2xs font-medium text-brand hover:text-brand-strong"
                >
                  View profile <ArrowRight className="size-2.5" aria-hidden />
                </Link>
              </div>
              <PQLScore score={u.pqlScore} size={34} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
