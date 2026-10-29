import type { ReactNode } from "react";
import { BadgeCheck, CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/tones";
import { humanize } from "@/lib/revenue-center/format";
import type { AcquisitionItem, HealthItem, ProfileDetails, UsageItem } from "@/lib/user-360/types";

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

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

function DetailRow({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-2 text-2xs">
      <dt className="truncate text-slate-600">{label}</dt>
      <dd className="truncate text-right font-medium text-gray-900" title={title}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

/** The account as the product sees it: profile and billing from the "User" table. */
export function AccountPanel({ details }: { details: ProfileDetails }) {
  const b = details.billing;
  const status = b.planStatus ? humanize(b.planStatus) : null;
  const statusTone = b.planStatus === "ACTIVE" ? "green" : b.planStatus ? "amber" : "slate";
  return (
    <SectionCard title="Profile & Billing" info="From the product's own user record, not from tracked events." bodyClassName="space-y-3 pt-1">
      <dl className="space-y-1.5">
        <DetailRow label="Username" value={details.username} title={details.username ?? undefined} />
        <DetailRow label="Location" value={details.location} title={details.location ?? undefined} />
        <DetailRow label="Onboarded" value={details.onboarded ? "Yes" : "No"} />
        <DetailRow label="Last seen in app" value={shortDate(details.lastSeenAt)} />
      </dl>
      {details.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Skills">
          {details.skills.slice(0, 12).map((skill) => (
            <li key={skill}>
              <Badge tone="slate" size="sm">
                {skill}
              </Badge>
            </li>
          ))}
          {details.skills.length > 12 && <li className="text-2xs text-slate-500">+{details.skills.length - 12} more</li>}
        </ul>
      )}
      <dl className="space-y-1.5 border-t border-slate-100 pt-2.5">
        <DetailRow label="Plan" value={b.plan ? humanize(b.plan) : null} />
        <DetailRow
          label="Status"
          value={
            status ? (
              <Badge tone={statusTone} size="sm">
                {status}
              </Badge>
            ) : null
          }
        />
        <DetailRow label="Billing cycle" value={b.billingCycle ? humanize(b.billingCycle) : null} />
        <DetailRow label="Current period ends" value={shortDate(b.currentPeriodEnd)} />
        {b.premiumUntil && <DetailRow label="Premium until" value={shortDate(b.premiumUntil)} />}
        {b.proUntil && <DetailRow label="Pro until" value={shortDate(b.proUntil)} />}
        <DetailRow label="Payment provider" value={b.paymentProvider ? humanize(b.paymentProvider) : null} />
      </dl>
    </SectionCard>
  );
}
