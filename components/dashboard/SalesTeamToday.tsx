import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatNumber } from "@/lib/revenue-center/format";
import type { SalesTeamData } from "@/lib/revenue-center/types";

// Decreasing teal intensity: each stage is a subset of the one before.
const SEGMENT_COLORS = ["#0d9488", "#14b8a6", "#2dd4bf", "#5eead4", "#99f6e4", "#ccfbf1"];

export function SalesTeamToday({ data }: { data: SalesTeamData }) {
  return (
    <SectionCard
      title="Sales Team Today"
      actions={
        <Link href="/sales-crm" className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-brand hover:text-brand-strong">
          View team <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
      bodyClassName="pt-1"
    >
      <ol className="grid grid-cols-6 gap-1" aria-label="Lead pipeline today">
        {data.pipeline.map((stage, i) => {
          const prev = data.pipeline[i - 1];
          const rate = prev && prev.value > 0 ? Math.round((stage.value / prev.value) * 100) : null;
          return (
            <li key={stage.key} className="min-w-0 text-center">
              <Tooltip content={rate === null ? `${stage.value} ${stage.label.toLowerCase()}` : `${rate}% of ${prev!.label.toLowerCase()}`} className="block w-full">
                <span tabIndex={0} className="focus-ring block w-full rounded">
                  <span className="block h-3.5 w-full first:rounded-l-md" style={{ background: SEGMENT_COLORS[i], borderRadius: i === 0 ? "6px 2px 2px 6px" : i === data.pipeline.length - 1 ? "2px 6px 6px 2px" : 2 }} />
                  <span className="tabular mt-1.5 block text-base leading-5 font-bold text-gray-900">{formatNumber(stage.value)}</span>
                  <span className="block text-[0.625rem] leading-3 text-slate-500 2xl:truncate 2xl:text-2xs">{stage.label}</span>
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ol>

      <h3 className="mt-3 mb-1.5 text-xs font-semibold text-gray-800">Top Performers (Contacts Made)</h3>
      {data.performers.length === 0 ? (
        <p className="text-xs text-slate-500">No calls, WhatsApps or emails logged yet today.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {data.performers.slice(0, 3).map((p, i) => (
            <li key={p.name} className="flex items-center gap-2.5 py-1.5 text-xs">
              <span className="tabular w-3 text-slate-400">{i + 1}</span>
              <Avatar name={p.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-gray-800">{p.name}</span>
              <span className="tabular font-semibold text-gray-900">{p.contacts}</span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
