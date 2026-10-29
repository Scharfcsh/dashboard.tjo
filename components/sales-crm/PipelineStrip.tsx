import { ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { cx, TONES } from "@/components/ui/tones";
import { formatNumber } from "@/lib/revenue-center/format";
import type { PipelineStage } from "@/lib/sales-crm/types";

// Each lead appears once, in the furthest stage it has reached, so the strip
// can never total more than the caller's leads.

export function PipelineStrip({ stages, total, team }: { stages: PipelineStage[]; total: number; team: boolean }) {
  return (
    <SectionCard
      title={team ? "Team Revenue Pipeline" : "My Revenue Pipeline"}
      info={`Every open or converted lead ${team ? "on the team" : "you own"}, counted once in the furthest stage it has reached. Lost leads are excluded.`}
      actions={<span className="tabular text-2xs whitespace-nowrap text-slate-500">{formatNumber(total)} leads</span>}
      bodyClassName="min-h-0 flex-1 overflow-x-auto px-4 pb-4"
    >
      <ol className="flex min-w-[36rem] items-stretch">
        {stages.map((s, i) => {
          const tone = TONES[s.tone];
          return (
            <li key={s.key} className="contents">
              {i > 0 && (
                <div className="flex w-5 shrink-0 items-center justify-center">
                  <ChevronRight className="size-3.5 text-slate-300" aria-hidden />
                </div>
              )}
              <div className={cx("flex min-w-0 flex-1 flex-col items-center rounded-lg border px-1.5 py-2 text-center", tone.tile)}>
                <span className="tabular text-lg leading-6 font-bold text-gray-900">{formatNumber(s.leads)}</span>
                <span className={cx("truncate text-[0.6875rem] leading-4 font-medium", tone.tileText)} title={s.label}>
                  {s.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
