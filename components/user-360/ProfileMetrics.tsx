import { Icon } from "@/components/ui/Icon";
import { TrendBadge } from "@/components/ui/TrendBadge";
import { cx, TONES } from "@/components/ui/tones";
import type { ProfileMetric } from "@/lib/user-360/types";

export function ProfileMetrics({ metrics }: { metrics: ProfileMetric[] }) {
  return (
    <section aria-label="Usage summary" className="grid grid-cols-2 gap-2.5 md:grid-cols-4 wide:grid-cols-8">
      {metrics.map((m) => {
        const tone = TONES[m.tone];
        return (
          <div key={m.key} className="card min-w-0 px-3 py-2.5" title={m.definition}>
            <div className="flex items-center gap-1.5">
              <span className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-md", tone.soft)}>
                <Icon name={m.icon} className={cx("size-3", tone.text)} />
              </span>
              <span className="truncate text-2xs text-slate-600">{m.label}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              <span className="tabular text-xl leading-7 font-bold text-gray-900">{m.value}</span>
              <TrendBadge value={m.trendPct} variant="inline" />
            </div>
            {m.bar ? (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[0.625rem] text-slate-500">{m.secondary}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={cx("block h-full rounded-full", m.bar.used >= m.bar.limit ? "bg-red-500" : m.bar.used >= 45 ? "bg-amber-500" : "bg-teal-500")}
                    style={{ width: `${Math.min(100, (m.bar.used / Math.max(1, m.bar.limit)) * 100)}%` }}
                  />
                </span>
              </div>
            ) : (
              m.secondary && <p className="mt-0.5 truncate text-[0.625rem] text-slate-500">{m.secondary}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
