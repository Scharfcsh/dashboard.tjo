import { cx } from "@/components/ui/tones";

// Usage as a ring. The colour steps at the same thresholds the scoring rules
// use, so "hot" looks hot in every panel.

export function UsageRing({ used, limit, size = 44 }: { used: number; limit: number; size?: number }) {
  const pct = limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = used >= limit ? "#ef4444" : used >= 45 ? "#f97316" : used >= 40 ? "#f59e0b" : "#0d9488";

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className={cx("tabular absolute text-2xs font-bold")} style={{ color }}>
        {pct}%
      </span>
    </span>
  );
}
