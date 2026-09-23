"use client";

import { CalendarClock, MessageCircle, Pencil, Phone, PhoneCall } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { useNow } from "@/components/ui/Now";
import { cx } from "@/components/ui/tones";
import { relativeTime } from "@/lib/revenue-center/format";
import { slaRemaining } from "@/lib/user-360/derive";
import type { SalesEngagement } from "@/lib/user-360/types";

export type SalesAction = "start_call" | "log_call" | "whatsapp" | "callback" | "assign";

export function SalesEngagementPanel({ sales, demo, onAction }: { sales: SalesEngagement; demo: boolean; onAction: (a: SalesAction) => void }) {
  const now = useNow();
  const sla = slaRemaining(sales.slaDueAt, now);
  const uncontacted = sales.status === "Uncontacted";

  const rows: [string, string, boolean][] = [
    ["Calls", sales.counts.call > 0 ? `${sales.counts.call} logged` : "No calls yet", sales.counts.call === 0],
    ["WhatsApp", sales.counts.whatsapp > 0 ? `${sales.counts.whatsapp} sent` : "No WhatsApp follow-up yet", sales.counts.whatsapp === 0],
    ["Sales Email", sales.counts.email > 0 ? `${sales.counts.email} sent` : "No sales email yet", sales.counts.email === 0],
    ["Lead Created", sales.leadCreatedAt ? relativeTime(sales.leadCreatedAt, now) : "No open lead", !sales.leadCreatedAt],
  ];

  const button = (action: SalesAction, label: string, Icon: typeof Phone, primary = false) => (
    <Tooltip content={demo ? "Disabled while showing demo data" : label} className="w-full">
      <button
        type="button"
        disabled={demo}
        onClick={() => onAction(action)}
        className={cx(
          "focus-ring inline-flex h-8 w-full min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-2xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          primary ? "bg-teal-50 text-teal-700 hover:bg-teal-100" : "border border-line bg-white text-slate-700 hover:bg-slate-50"
        )}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
    </Tooltip>
  );

  return (
    <SectionCard title="Sales Engagement" info="Ownership, outreach so far and the SLA clock for this lead." bodyClassName="pt-1">
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 gap-x-2">
        <span className="flex min-w-0 items-center gap-1.5 text-2xs">
          <span className="text-slate-500">Owner</span>
          {sales.ownerName ? (
            <>
              <Avatar name={sales.ownerName} size="sm" />
              <span className="truncate font-semibold text-gray-900">{sales.ownerName}</span>
            </>
          ) : (
            <span className="text-slate-400">Unassigned</span>
          )}
          <Tooltip content={demo ? "Disabled while showing demo data" : "Change the sales owner"}>
            <button
              type="button"
              onClick={() => onAction("assign")}
              disabled={demo}
              aria-label="Change sales owner"
              className="focus-ring rounded p-0.5 text-slate-400 hover:text-brand disabled:text-slate-300"
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          </Tooltip>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-2xs text-slate-500">
          Status
          <Badge tone={uncontacted ? "red" : "green"} size="sm">
            {sales.status}
          </Badge>
        </span>
      </div>

      <dl className="mt-2 space-y-1">
        {rows.map(([label, value, muted]) => (
          <div key={label} className="flex items-center justify-between gap-2 text-2xs">
            <dt className="text-slate-500">{label}</dt>
            <dd className={cx("truncate", muted ? "text-slate-400" : "font-medium text-gray-900")}>{value}</dd>
          </div>
        ))}
        {sla && (
          <div className="flex items-center justify-between gap-2 text-2xs">
            <dt className="text-slate-500">SLA Remaining</dt>
            <dd className={cx("inline-flex items-center gap-1 font-semibold", sla.overdue ? "text-red-600" : "text-amber-600")}>
              <CalendarClock className="size-3" aria-hidden />
              {sla.text}
            </dd>
          </div>
        )}
        {sales.pendingCallbacks.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-2xs">
            <dt className="text-slate-500">Callback</dt>
            <dd className="font-medium text-gray-900">{relativeTime(sales.pendingCallbacks[0]!.due_at, now)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {button("start_call", "Start Call", PhoneCall, true)}
        {button("log_call", "Log Call", Phone)}
        {button("whatsapp", "Send WhatsApp", MessageCircle)}
        {button("callback", "Schedule Callback", CalendarClock)}
      </div>
    </SectionCard>
  );
}
