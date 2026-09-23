import { SectionCard } from "@/components/dashboard/SectionCard";
import type { FeatureUsageRow } from "@/lib/live-intelligence/types";

export function FeatureUsage({ rows }: { rows: FeatureUsageRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.users));
  return (
    <SectionCard title="Features Being Used Right Now" info="Users active in the last 30 minutes, by the product area they are currently on." bodyClassName="pt-1">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.feature} className="grid grid-cols-[6.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-2xs 2xl:text-xs">
            <span className="truncate text-slate-600">{r.feature}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${r.feature}: ${r.users} users`}>
              <span className="block h-full rounded-full bg-teal-600" style={{ width: `${(r.users / max) * 100}%` }} />
            </span>
            <span className="tabular text-right text-slate-600">{r.users}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
