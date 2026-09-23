import { Icon } from "@/components/ui/Icon";
import { TrendBadge } from "@/components/ui/TrendBadge";
import { cx, TONES } from "@/components/ui/tones";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/revenue-center/format";
import type { IntelligenceMetric } from "@/lib/revenue-center/types";

const SHORT_LABELS: Record<string, string> = {
  pricing_to_checkout: "Pricing → Checkout",
  checkout_to_paid: "Checkout → Paid",
  arppu: "Avg Revenue / Paid User",
};

function display(m: IntelligenceMetric) {
  if (m.value === null) return "—";
  if (m.format === "percent") return formatPercent(m.value);
  if (m.format === "currency") return formatCurrency(m.value);
  return formatNumber(m.value);
}

export function IntelligenceMetrics({ metrics }: { metrics: IntelligenceMetric[] }) {
  return (
    <section aria-label="Conversion intelligence, last 30 days" className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
      {metrics.map((m) => (
        <div key={m.key} className="card min-w-0 px-3 py-2.5" title={`${m.label}: ${m.definition}${m.value === null ? " Not enough data yet." : ""}`}>
          <div className="flex items-center gap-1.5">
            <Icon name={m.icon} className={cx("size-3.5 shrink-0", TONES[m.tone].text)} />
            <span className="truncate text-2xs text-slate-600">{SHORT_LABELS[m.key] ?? m.label}</span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="tabular text-lg leading-6 font-bold text-gray-900">{display(m)}</span>
            <TrendBadge value={m.change} unit={m.changeUnit} variant="inline" />
          </div>
        </div>
      ))}
    </section>
  );
}
