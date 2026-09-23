import { SectionCard } from "@/components/dashboard/SectionCard";
import { formatNumber } from "@/lib/revenue-center/format";
import type { SessionBucket } from "@/lib/live-intelligence/types";

export function SessionDistribution({ buckets }: { buckets: SessionBucket[] }) {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <SectionCard title="Today's User Sessions" info="Sessions started today by duration. Open sessions count time so far." bodyClassName="pt-0">
      <p className="mb-2.5 text-2xs text-slate-500">Total sessions: {formatNumber(total)}</p>
      <ul className="space-y-2.5">
        {buckets.map((b) => {
          const share = total === 0 ? 0 : Math.round((b.count / total) * 100);
          return (
            <li key={b.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-2xs 2xl:text-xs">
              <span className="text-slate-600">{b.label}</span>
              <span className="h-3.5 overflow-hidden rounded bg-slate-100" role="img" aria-label={`${b.label}: ${b.count} sessions, ${share}%`}>
                <span className="block h-full rounded bg-teal-500/85" style={{ width: `${(b.count / max) * 100}%` }} />
              </span>
              <span className="tabular text-right text-slate-600">
                {b.count} <span className="text-slate-400">({share}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
