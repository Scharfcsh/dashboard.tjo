import { SectionCard } from "@/components/dashboard/SectionCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatNumber, formatPercent } from "@/lib/revenue-center/format";
import type { LeadReason } from "@/lib/pql-intelligence/types";

// Ranked scoring rules, read from the stored reasons behind each user's score -
// so "96 because of A + B + C" and this chart can never disagree.

export function PqlReasonChart({ reasons, scoredUsers }: { reasons: LeadReason[]; scoredUsers: number }) {
  const max = reasons.reduce((m, r) => Math.max(m, r.users), 0);

  return (
    <SectionCard
      title="Why Users Are Becoming PQLs"
      info={`How many of the ${formatNumber(scoredUsers)} scored unpaid users each positive scoring rule currently fires for. A user usually matches several, so these do not add up to the total.`}
    >
      {reasons.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-500">No scoring rules are firing yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {reasons.map((r) => (
            <li key={r.ruleId} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2">
              <Tooltip content={`${r.label} adds ${r.points > 0 ? "+" : ""}${r.points} points. ${formatNumber(r.users)} users (${formatPercent(r.sharePct, 0)}).`} align="start">
                <span tabIndex={0} className="focus-ring block min-w-0 rounded">
                  <span className="block truncate text-2xs text-slate-600" title={r.label}>
                    {r.label}
                  </span>
                  <span className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-teal-500/85"
                      style={{ width: `${max === 0 ? 0 : Math.max((r.users / max) * 100, r.users > 0 ? 2 : 0)}%` }}
                    />
                  </span>
                </span>
              </Tooltip>
              <span className="tabular text-right text-2xs text-gray-800">
                {formatNumber(r.users)}
                <span className="ml-1 text-slate-400">({formatPercent(r.sharePct, 0)})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
