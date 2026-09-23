import { BadgeCheck, CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/tones";
import type { AcquisitionItem, HealthItem, UsageItem } from "@/lib/user-360/types";

export function ProductUsagePanel({ items }: { items: UsageItem[] }) {
  return (
    <SectionCard title="Product Usage" info="What this user has actually done in the product." bodyClassName="pt-1">
      <dl className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] items-center gap-2 text-2xs">
            <dt className="flex min-w-0 items-center gap-1.5 text-slate-600">
              <Icon name={item.icon} className="size-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{item.label}</span>
            </dt>
            <dd className="flex min-w-0 items-center justify-end gap-2">
              {item.state === "yes" && <CircleCheck className="size-3.5 shrink-0 text-emerald-500" aria-hidden />}
              {item.state === "no" && <CircleX className="size-3.5 shrink-0 text-slate-300" aria-hidden />}
              <span className={cx("truncate text-right font-medium", item.value === "Not tracked yet" ? "text-slate-400 italic" : "text-gray-900")} title={item.value ?? undefined}>
                {item.value ?? "—"}
              </span>
              {item.progress !== null && (
                <span className="hidden h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 2xl:block">
                  <span className="block h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, item.progress)}%` }} />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

export function AcquisitionPanel({ items }: { items: AcquisitionItem[] }) {
  return (
    <SectionCard title="Acquisition" info="Where this user came from (first touch) and the devices they use." bodyClassName="pt-1">
      <dl className="space-y-1.5">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-2 text-2xs">
            <dt className="flex min-w-0 items-center gap-1.5 text-slate-600">
              <Icon name={item.icon} className="size-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{item.label}</span>
            </dt>
            <dd className={cx("truncate text-right font-medium", item.mono ? "font-mono text-teal-700" : "text-gray-900")} title={item.value ?? undefined}>
              {item.value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

const SEVERITY_ICON = { ok: CircleCheck, warn: CircleAlert, bad: CircleX } as const;
const SEVERITY_CLASS = { ok: "text-emerald-500", warn: "text-amber-500", bad: "text-red-500" } as const;

export function ProductHealthPanel({ status, items }: { status: "Healthy" | "Needs attention"; items: HealthItem[] }) {
  return (
    <SectionCard
      title="Product Health"
      info="Failures and friction this user has hit. A product problem is not a sales problem."
      actions={
        <Badge tone={status === "Healthy" ? "green" : "red"} className="inline-flex items-center gap-1">
          <BadgeCheck className="size-3" aria-hidden />
          {status}
        </Badge>
      }
      bodyClassName="pt-1"
    >
      <ul className="space-y-1.5">
        {items.map((item) => {
          const IconCmp = SEVERITY_ICON[item.severity];
          return (
            <li key={item.label} className="flex items-center gap-2 text-2xs text-slate-700">
              <IconCmp className={cx("size-3.5 shrink-0", SEVERITY_CLASS[item.severity])} aria-hidden />
              <span className="truncate">{item.label}</span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
