import { SectionCard } from "@/components/dashboard/SectionCard";
import { Avatar } from "@/components/ui/Avatar";
import { cx } from "@/components/ui/tones";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/revenue-center/format";
import type { LeaderboardRow } from "@/lib/sales-crm/types";

// Manager view. Grouped by the lead's owner rather than by who logged the
// activity, so work is credited to whoever owns the relationship.

export function CallerLeaderboard({ rows, rangeLabel }: { rows: LeaderboardRow[]; rangeLabel: string }) {
  return (
    <SectionCard
      title="Caller Performance"
      info="Per caller, for the selected range. Counted against the lead's owner, not against whoever typed the note. Conversion rate is conversions over leads received in the range."
      actions={<span className="text-2xs whitespace-nowrap text-slate-500">{rangeLabel}</span>}
      bodyClassName="min-h-0 flex-1 px-0 pb-2"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-xs">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-2xs text-slate-500">
              <th scope="col" className="py-2 pr-1.5 pl-4 font-medium">Caller</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Leads</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Calls</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Conn.</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Interested</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Conv.</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Revenue</th>
              <th scope="col" className="py-2 pr-4 pl-1.5 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">
                  No sales activity in this range yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.callerId}
                className={cx("border-b border-slate-100 last:border-b-0", r.isSelf ? "bg-brand-soft" : "hover:bg-slate-50/80")}
              >
                <td className="py-2 pr-1.5 pl-4">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Avatar name={r.name} size="sm" />
                    <span className="truncate font-medium text-gray-900">{r.name}</span>
                    {r.isSelf && <span className="shrink-0 text-2xs text-brand">You</span>}
                  </span>
                </td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(r.leads)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(r.calls)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(r.connections)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(r.interested)}</td>
                <td className="tabular px-1.5 py-2 text-right font-semibold text-gray-900">{formatNumber(r.conversions)}</td>
                <td className="tabular px-1.5 py-2 text-right text-gray-800">{formatCurrency(r.revenue)}</td>
                <td className="tabular py-2 pr-4 pl-1.5 text-right font-semibold text-emerald-600">
                  {formatPercent(r.conversionRatePct, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
