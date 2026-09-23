import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatSigned } from "@/lib/revenue-center/format";
import { cx } from "@/components/ui/tones";

/** Trend pill: green up / red down. `variant="inline"` renders without a background. */
export function TrendBadge({
  value,
  unit = "%",
  variant = "pill",
  invert = false,
}: {
  value: number | null;
  unit?: string;
  variant?: "pill" | "inline";
  invert?: boolean;
}) {
  if (value === null) return null;
  const good = invert ? value <= 0 : value >= 0;
  const Arrow = value >= 0 ? ArrowUpRight : ArrowDownRight;
  const label = `${formatSigned(value, unit === "pts" ? " pts" : unit)} vs previous period`;
  return (
    <span
      aria-label={label}
      className={cx(
        "tabular inline-flex items-center gap-0.5 whitespace-nowrap font-semibold",
        variant === "pill" ? "rounded-md px-2 py-1 text-xs" : "text-2xs",
        good ? "text-emerald-600" : "text-red-500",
        variant === "pill" && (good ? "bg-emerald-50" : "bg-red-50")
      )}
    >
      <Arrow className="size-3.5" strokeWidth={2.25} aria-hidden />
      {formatSigned(value, unit === "pts" ? "pts" : unit)}
    </span>
  );
}
