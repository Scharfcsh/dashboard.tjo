import { Flame } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { cx } from "@/components/ui/tones";
import type { PqlSignal } from "@/lib/user-360/types";

const TAG_TONE: Record<string, string> = {
  "High Intent": "bg-red-50 text-red-600",
  "Purchase Intent": "bg-orange-50 text-orange-600",
  "Strong Signal": "bg-amber-50 text-amber-700",
  Engaged: "bg-blue-50 text-blue-600",
  "Recent Activity": "bg-teal-50 text-teal-700",
  "Profile Complete": "bg-violet-50 text-violet-600",
  Onboarded: "bg-slate-100 text-slate-600",
  Activated: "bg-teal-50 text-teal-700",
  "Revenue Risk": "bg-red-50 text-red-600",
  Inactivity: "bg-slate-100 text-slate-500",
  Neutral: "bg-slate-100 text-slate-500",
};

function Row({ signal }: { signal: PqlSignal }) {
  const positive = signal.points > 0;
  return (
    <li className="flex items-center gap-2 py-[0.1875rem] text-2xs">
      <span
        className={cx(
          "tabular inline-flex h-5 w-9 shrink-0 items-center justify-center rounded-md font-semibold",
          positive ? "bg-emerald-50 text-emerald-700" : signal.points < 0 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
        )}
      >
        {signal.points > 0 ? `+${signal.points}` : signal.points}
      </span>
      <span className="min-w-0 flex-1 truncate text-gray-800" title={signal.label}>
        {signal.label}
      </span>
      {signal.tag && <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[0.5625rem] font-medium", TAG_TONE[signal.tag] ?? "bg-slate-100 text-slate-500")}>{signal.tag}</span>}
    </li>
  );
}

export function PqlReasonPanel({ score, positive, negative }: { score: number; positive: PqlSignal[]; negative: PqlSignal[] }) {
  return (
    <SectionCard
      title="Why This User Is Hot"
      info="Every point in the PQL score, from lib/scoring/pql-config.ts. A user is explainable as 96 = A + B + C."
      actions={
        <span className="inline-flex items-center gap-1.5 text-2xs text-slate-500">
          <span className="hidden 2xl:inline">PQL Score</span>
          <span className="tabular rounded-md bg-gray-900 px-1.5 py-0.5 text-2xs font-bold text-white">
            {score}
            <span className="font-normal text-slate-300">/100</span>
          </span>
        </span>
      }
      bodyClassName="pt-0.5"
    >
      <ul>
        {positive.map((s) => (
          <Row key={s.label} signal={s} />
        ))}
      </ul>
      {negative.length > 0 && (
        <ul className="mt-1 border-t border-slate-100 pt-1">
          {negative.map((s) => (
            <Row key={s.label} signal={s} />
          ))}
        </ul>
      )}
      {positive.length === 0 && negative.length === 0 && (
        <p className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <Flame className="size-4 text-slate-300" aria-hidden /> No scoring signals yet — this user has not been scored.
        </p>
      )}
    </SectionCard>
  );
}
