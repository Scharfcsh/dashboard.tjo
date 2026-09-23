import { FlaskConical } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import type { ExperimentView } from "@/lib/pql-intelligence/types";
import { formatNumber, formatPercent, formatSigned } from "@/lib/revenue-center/format";

// Free-plan experiments. Lift and confidence are measured against the control
// arm; confidence is a two-tailed two-proportion z-test, so a small sample
// honestly reads low rather than looking decisive.

const STATUS_TONE = (status: string) => (status === "Running" ? "green" : status === "Completed" ? "blue" : "slate");

export function ExperimentPanel({ experiments }: { experiments: ExperimentView[] }) {
  return (
    <SectionCard
      title="Free Plan Experiments"
      info="Assignment comes from the product's server-side experiment_assigned events; a user is counted in the first arm they were put in. Conversion counts a first payment after assignment. Confidence is a two-tailed two-proportion z-test against the control."
      bodyClassName="min-h-0 flex-1 px-0 pb-2"
    >
      {experiments.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-slate-100">
            <FlaskConical className="size-4 text-slate-400" aria-hidden />
          </span>
          <p className="mt-2 text-sm font-semibold text-gray-900">No experiments running</p>
          <p className="mt-1 text-xs text-slate-500">
            Results appear here once the product sends <code className="font-mono text-2xs">experiment_assigned</code>{" "}
            events carrying an experiment id and variant.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-2xs text-slate-500">
                <th scope="col" className="py-2 pr-1.5 pl-4 font-medium">Experiment</th>
                <th scope="col" className="px-1.5 py-2 font-medium">Status</th>
                <th scope="col" className="px-1.5 py-2 text-right font-medium">Users</th>
                <th scope="col" className="px-1.5 py-2 text-right font-medium">Conv.</th>
                <th scope="col" className="py-2 pr-4 pl-1.5 text-right font-medium">Lift</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80">
                  <td className="py-2 pr-1.5 pl-4">
                    <Tooltip
                      align="start"
                      content={
                        <span className="block space-y-0.5">
                          {e.variants.map((v) => (
                            <span key={v.variant} className="block">
                              {v.label}
                              {v.isControl ? " (control)" : ""}: {formatNumber(v.users)} users,{" "}
                              {formatPercent(v.conversionPct, 1)} converted
                            </span>
                          ))}
                          {e.confidencePct !== null && (
                            <span className="block pt-0.5">Confidence {formatPercent(e.confidencePct, 0)}</span>
                          )}
                        </span>
                      }
                    >
                      <span tabIndex={0} className="focus-ring block max-w-full truncate rounded text-gray-800" title={e.name}>
                        {e.name}
                      </span>
                    </Tooltip>
                  </td>
                  <td className="px-1.5 py-2">
                    <Badge tone={STATUS_TONE(e.status)} size="sm">
                      {e.status}
                    </Badge>
                  </td>
                  <td className="tabular px-1.5 py-2 text-right text-slate-600">{formatNumber(e.users)}</td>
                  <td className="tabular px-1.5 py-2 text-right font-semibold text-gray-900">
                    {formatPercent(e.conversionPct, 1)}
                  </td>
                  <td className="tabular py-2 pr-4 pl-1.5 text-right font-semibold">
                    {e.liftPct === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className={cx(e.liftPct >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {formatSigned(e.liftPct, "%")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
