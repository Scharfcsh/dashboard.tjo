import { SectionCard } from "@/components/dashboard/SectionCard";
import { cx } from "@/components/ui/tones";
import type { TriggerRow } from "@/lib/pql-intelligence/types";
import { formatNumber, formatPercent } from "@/lib/revenue-center/format";

// Which usage moment actually produces revenue. "Exposed" means a real upgrade
// prompt impression when the product sends them, and otherwise arriving at the
// threshold - the panel says which, rather than implying the stronger one.

const BASIS_NOTE: Record<"upgrade_prompt_shown" | "milestone_reached", string> = {
  upgrade_prompt_shown: "Exposure counts real upgrade-prompt impressions.",
  milestone_reached:
    "Exposure counts users reaching the threshold — the product does not send upgrade_prompt_shown yet, so true impressions are unknown.",
};

export function TriggerEffectivenessTable({
  triggers,
  exposureBasis,
}: {
  triggers: TriggerRow[];
  exposureBasis: "upgrade_prompt_shown" | "milestone_reached";
}) {
  const best = triggers.reduce((m, t) => Math.max(m, t.conversionPct ?? 0), 0);

  return (
    <SectionCard
      title="Upgrade Trigger Effectiveness"
      info={`How many users each usage moment reached, how many then looked at pricing or started checkout, and how many paid within 14 days. ${BASIS_NOTE[exposureBasis]}`}
      bodyClassName="min-h-0 flex-1 px-0 pb-2"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] border-collapse text-xs">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-2xs text-slate-500">
              <th scope="col" className="py-2 pr-1.5 pl-4 font-medium">Trigger</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Exposed</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Pricing</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Checkout</th>
              <th scope="col" className="px-1.5 py-2 text-right font-medium">Paid</th>
              <th scope="col" className="py-2 pr-4 pl-1.5 text-right font-medium">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {triggers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                  No users reached these thresholds in this window.
                </td>
              </tr>
            )}
            {triggers.map((t) => (
              <tr key={t.key} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80">
                <td className="truncate py-2 pr-1.5 pl-4 text-gray-800">{t.label}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(t.usersExposed)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(t.pricingClick)}</td>
                <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(t.checkout)}</td>
                <td className="tabular px-1.5 py-2 text-right font-semibold text-gray-900">{formatNumber(t.paid)}</td>
                <td
                  className={cx(
                    "tabular py-2 pr-4 pl-1.5 text-right font-semibold",
                    (t.conversionPct ?? 0) >= best && best > 0 ? "text-emerald-600" : "text-gray-800"
                  )}
                >
                  {formatPercent(t.conversionPct, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
