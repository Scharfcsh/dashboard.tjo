import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { cx, TONES } from "@/components/ui/tones";
import { formatNumber, formatPercent } from "@/lib/revenue-center/format";
import type { PoolSegment } from "@/lib/sales-crm/types";

// Every unpaid user active in the range, in the band that says how to treat
// them. A product failure outranks every buying signal — you do not sell to
// someone the product is currently failing.

export function LeadPoolBar({ segments, activeUsers }: { segments: PoolSegment[]; activeUsers: number }) {
  return (
    <SectionCard
      title="Today's Warm Lead Pool"
      info="Unpaid users with meaningful activity in the selected range, each counted in the first band they match. Product Issue wins over every buying signal: support before selling."
      actions={
        <span className="flex items-center gap-2">
          <span className="tabular hidden text-2xs whitespace-nowrap text-slate-500 sm:inline">
            {formatNumber(activeUsers)} active {activeUsers === 1 ? "user" : "users"}
          </span>
          <Link
            href="/pql-leads"
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-brand hover:text-brand-strong"
          >
            View all leads <ArrowRight className="size-3" aria-hidden />
          </Link>
        </span>
      }
    >
      {activeUsers === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">No unpaid users were active in this range.</p>
      ) : (
        <>
          <div
            className="flex h-2.5 w-full gap-1 overflow-hidden"
            role="img"
            aria-label={segments.map((s) => `${s.label} ${s.users}`).join(", ")}
          >
            {segments.map((s) =>
              s.users === 0 ? null : (
                <span
                  key={s.key}
                  className={cx("block h-full rounded-full", TONES[s.tone].solid)}
                  style={{ width: `${Math.max(s.sharePct ?? 0, 2)}%` }}
                />
              )
            )}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 wide:grid-cols-5">
            {segments.map((s) => (
              <li key={s.key} className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className={cx("size-2 shrink-0 rounded-full", TONES[s.tone].dot)} aria-hidden />
                  <span className="truncate text-2xs font-medium text-slate-600">{s.label}</span>
                </span>
                <span className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="tabular text-lg leading-6 font-bold text-gray-900">{formatNumber(s.users)}</span>
                  <span className="tabular text-2xs text-slate-400">{formatPercent(s.sharePct, 0)}</span>
                </span>
                <span className={cx("block truncate text-2xs font-medium", TONES[s.tone].text)} title={s.action}>
                  {s.action}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
