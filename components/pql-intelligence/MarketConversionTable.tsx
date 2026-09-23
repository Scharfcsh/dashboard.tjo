import { SectionCard } from "@/components/dashboard/SectionCard";
import { CountryBadge } from "@/components/ui/CountryBadge";
import { cx } from "@/components/ui/tones";
import { RANGE_LABELS } from "@/lib/pql-intelligence/filters";
import type { MarketRow, PqlRange } from "@/lib/pql-intelligence/types";
import { formatNumber, formatPercent } from "@/lib/revenue-center/format";

export function MarketConversionTable({ markets, range }: { markets: MarketRow[]; range: PqlRange }) {
  const best = markets.reduce((m, r) => Math.max(m, r.conversionPct ?? 0), 0);

  return (
    <SectionCard
      title="Usage-to-Paid Conversion by Market"
      info={`Users who signed up in the selected window (${RANGE_LABELS[range]}), and how far each market got: activated, 40+ Auto Applies, pricing, checkout, paid. Stages count milestones reached at any time since.`}
      bodyClassName="min-h-0 flex-1 px-0 pb-2"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-xs">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-2xs text-slate-500">
              <th scope="col" className="py-2 pr-1.5 pl-4 font-medium">Country</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Users</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Activated</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">40+</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Pricing</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Checkout</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Paid</th>
              <th scope="col" className="py-2 pr-4 pl-1.5 text-right font-medium">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {markets.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">
                  No signups in this window yet.
                </td>
              </tr>
            )}
            {markets.map((m) => (
              <tr key={m.country ?? "unknown"} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80">
                <td className="py-2 pr-1.5 pl-4">
                  <CountryBadge code={m.country} />
                </td>
                <td className="tabular px-1.5 py-2 text-right text-gray-800">{formatNumber(m.users)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(m.activated)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(m.usage40Plus)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(m.pricing)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(m.checkout)}</td>
                <td className="tabular px-1.5 py-2 text-right font-semibold text-gray-900">{formatNumber(m.paid)}</td>
                <td
                  className={cx(
                    "tabular py-2 pr-4 pl-1.5 text-right font-semibold",
                    (m.conversionPct ?? 0) >= best && best > 0 ? "text-emerald-600" : "text-gray-800"
                  )}
                >
                  {formatPercent(m.conversionPct, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
