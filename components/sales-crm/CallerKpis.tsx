import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx, TONES } from "@/components/ui/tones";
import { formatCurrency, formatNumber } from "@/lib/revenue-center/format";
import type { SalesKpi } from "@/lib/sales-crm/types";

export function CallerKpis({ kpis }: { kpis: SalesKpi[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 wide:grid-cols-7">
      {kpis.map((k) => {
        const tone = TONES[k.tone];
        return (
          <li key={k.key} className="card flex min-w-0 flex-col px-3 py-2.5">
            <Tooltip content={k.definition} align="start">
              <span tabIndex={0} className="focus-ring flex items-center gap-2 rounded">
                <span className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-md", tone.soft)}>
                  <Icon name={k.icon} className={cx("size-3", tone.text)} />
                </span>
                <span className="truncate text-2xs font-medium text-slate-600">{k.label}</span>
              </span>
            </Tooltip>
            <span className="tabular mt-1 text-2xl leading-7 font-bold tracking-tight text-gray-900">
              {k.format === "currency" ? formatCurrency(k.value) : formatNumber(k.value)}
            </span>
            {k.caption && (
              <span
                className={cx("truncate text-2xs", k.captionTone ? TONES[k.captionTone].text : "text-slate-500")}
                title={k.caption}
              >
                {k.caption}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
