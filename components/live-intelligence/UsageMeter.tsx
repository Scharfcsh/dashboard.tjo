import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";

/** n/limit with a thin bar. 45+ is a warning, the full allowance is urgent. */
export function UsageMeter({ used, limit }: { used: number; limit: number }) {
  const exhausted = used >= limit;
  const near = !exhausted && used >= 45;
  const bar = exhausted ? "bg-red-500" : near ? "bg-amber-500" : used >= 40 ? "bg-amber-400" : "bg-teal-500";
  const label = exhausted ? "Quota exhausted — strongest upgrade signal" : near ? "Near the free Auto Apply limit" : `${limit - used} free Auto Applies left`;
  return (
    <Tooltip content={label}>
      <span tabIndex={0} className="focus-ring block w-full min-w-0 rounded" aria-label={`${used} of ${limit} free Auto Applies used. ${label}`}>
        <span className={cx("tabular block text-2xs leading-4", exhausted ? "font-semibold text-red-600" : near ? "font-semibold text-amber-700" : "text-slate-600")}>
          {used}/{limit}
          {exhausted && <span className="ml-1 font-medium">· Exhausted</span>}
        </span>
        <span className="mt-0.5 block h-1 w-full max-w-14 overflow-hidden rounded-full bg-slate-100">
          <span className={cx("block h-full rounded-full", bar)} style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} />
        </span>
      </span>
    </Tooltip>
  );
}
