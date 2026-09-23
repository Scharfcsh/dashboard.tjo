"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Icon } from "@/components/ui/Icon";
import { useNow } from "@/components/ui/Now";
import { cx, TONES } from "@/components/ui/tones";
import { compactAgo } from "@/lib/revenue-center/format";
import type { AlertGroup } from "@/lib/revenue-center/types";

const SEVERITY_LABEL: Record<AlertGroup["severity"], string> = {
  critical: "Critical",
  warning: "Warning",
  opportunity: "Opportunity",
  recovery: "Recovery",
};

export function RevenueAlerts({ alerts }: { alerts: AlertGroup[] }) {
  const now = useNow();
  return (
    <SectionCard
      title="Critical Revenue Alerts"
      actions={
        <Link href="/alerts" className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-brand hover:text-brand-strong">
          View all <ArrowRight className="size-3" aria-hidden />
        </Link>
      }
      bodyClassName="pt-0.5"
    >
      {alerts.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">No open revenue alerts. Rules are evaluated every 2 minutes.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {alerts.slice(0, 6).map((a) => (
            <li key={a.id} className="flex items-center gap-2.5 py-[0.3125rem]">
              <Icon name={a.icon} className={cx("size-4 shrink-0", TONES[a.tone].text)} aria-label={SEVERITY_LABEL[a.severity]} />
              <span className="sr-only">{SEVERITY_LABEL[a.severity]}:</span>
              <span className="min-w-0 flex-1 truncate text-xs text-gray-800" title={a.text}>
                {a.text}
              </span>
              <time dateTime={a.latestAt} className="tabular shrink-0 text-2xs text-slate-400">
                {compactAgo(a.latestAt, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
