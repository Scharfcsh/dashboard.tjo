import { Tooltip } from "@/components/ui/Tooltip";

const CATEGORY = (score: number) => (score >= 90 ? "Buy Now" : score >= 75 ? "Hot" : score >= 60 ? "Warm" : score >= 40 ? "Engaged" : "Early");

/** Compact circular PQL score. Teal for hot, amber for warm, slate below. */
export function PQLScore({ score, size = 30, showTotal = false }: { score: number; size?: number; showTotal?: boolean }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "#0d9488" : score >= 60 ? "#f59e0b" : "#94a3b8";
  return (
    <Tooltip content={`PQL score ${score}/100 · ${CATEGORY(score)}. Higher = stronger purchase intent.`}>
      <span tabIndex={0} className="focus-ring relative inline-flex rounded-full" style={{ width: size, height: size }} aria-label={`PQL score ${score} of 100`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(Math.min(100, Math.max(0, score)) / 100) * c} ${c}`}
          />
        </svg>
        <span className="tabular absolute inset-0 flex flex-col items-center justify-center leading-none font-semibold text-gray-900">
          <span style={{ fontSize: size > 60 ? 22 : size > 40 ? 14 : 10.5 }}>{score}</span>
          {showTotal && <span className="mt-0.5 text-[0.5625rem] font-medium text-slate-400">/100</span>}
        </span>
      </span>
    </Tooltip>
  );
}
