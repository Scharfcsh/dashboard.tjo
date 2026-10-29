"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, Mail, MessageCircle, Phone } from "lucide-react";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useNow } from "@/components/ui/Now";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx, TONES } from "@/components/ui/tones";
import { formatNumber, relativeTime } from "@/lib/revenue-center/format";
import type { QueueLead } from "@/lib/sales-crm/types";
import type { Tone } from "@/lib/revenue-center/types";

// The caller's queue, in the order the system says to work it. It is never
// re-sorted client-side: the ranking is the product's, not a column header's.

const PRIORITY_TONE: Record<string, Tone> = { P0: "red", P1: "amber", P2: "slate" };
const INTENT_TONE: Record<QueueLead["pricingIntent"], Tone> = {
  "Very High": "red",
  High: "orange",
  Medium: "amber",
  Low: "slate",
};

const ACTION_ICON = { call: Phone, whatsapp: MessageCircle, email: Mail } as const;
const ACTION_LABEL = { call: "Call", whatsapp: "WhatsApp", email: "Email" } as const;

// Priority, User, PQL, Lead Reason, Auto Apply, Pricing, Last Active, Last Contact, Status, Next Action
const COLUMN_WIDTHS = [5, 15, 5.5, 16, 7.5, 8, 9.5, 8.5, 10.5, 14.5];

export function MyLeadsTable({
  leads,
  total,
  selectedLeadId,
  demo,
  busy,
  team,
  onSelect,
  onContact,
}: {
  leads: QueueLead[];
  total: number;
  selectedLeadId: string | null;
  demo: boolean;
  busy: boolean;
  /** Manager view: every lead on the team, assigned or not. */
  team: boolean;
  onSelect: (leadId: string) => void;
  onContact: (lead: QueueLead, type: "call" | "whatsapp" | "email") => void;
}) {
  const now = useNow();

  return (
    <SectionCard
      id="my-leads"
      title={team ? "Team Leads" : "My Leads"}
      info={`${team ? "Every open lead on the team, assigned or not" : "Your assigned open leads"}, ordered the way the system says to work them: callbacks that are due, then P0 leads past their response SLA, then priority, then PQL score.`}
      actions={
        <span className="flex items-center gap-2">
          <span className="tabular hidden text-2xs whitespace-nowrap text-slate-500 sm:inline">
            {formatNumber(leads.length)} of {formatNumber(total)} assigned
          </span>
          <Link
            href="/pql-leads"
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-brand hover:text-brand-strong"
          >
            View all leads <ArrowRight className="size-3" aria-hidden />
          </Link>
        </span>
      }
      bodyClassName={cx("min-h-0 flex-1 px-0 pb-1 transition-opacity", busy && "opacity-60")}
    >
      <div className="max-h-[26rem] overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[44rem] table-fixed border-collapse text-xs">
          <colgroup>
            {COLUMN_WIDTHS.map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50 text-left text-2xs text-slate-500">
              <th scope="col" className="py-2 pr-1.5 pl-4 font-medium">Priority</th>
              <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">User</th>
              <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">PQL</th>
              <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Lead Reason</th>
              <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Auto Apply</th>
              <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Pricing</th>
              <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Last Active</th>
              <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Last Contact</th>
              <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Status</th>
              <th scope="col" className="py-2 pr-4 pl-1.5 font-medium">Next Action</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-xs text-slate-500">
                  No open leads are assigned to you.
                </td>
              </tr>
            )}
            {leads.map((l) => {
              const Icon = ACTION_ICON[l.nextAction];
              const urgent = l.priority === "P0";
              const selected = l.leadId === selectedLeadId;
              return (
                <tr
                  key={l.leadId}
                  onClick={() => onSelect(l.leadId)}
                  aria-selected={selected}
                  className={cx(
                    "group cursor-pointer border-b border-slate-100 transition-colors last:border-b-0",
                    selected ? "bg-brand-soft" : urgent ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-slate-50/80"
                  )}
                >
                  <td className={cx("py-2 pr-1.5 pl-4", urgent && "shadow-[inset_3px_0_0_0_#ef4444]")}>
                    <span className="flex items-center gap-1">
                      <Badge tone={PRIORITY_TONE[l.priority ?? "P2"] ?? "slate"} size="sm" className="font-semibold">
                        {l.priority ?? "—"}
                      </Badge>
                      {l.pendingDisposition && (
                        <Tooltip content="A connected call on this lead still needs an outcome.">
                          <span tabIndex={0} className="focus-ring rounded">
                            <CircleAlert className="size-3.5 text-amber-500" aria-label="Needs an outcome" />
                          </span>
                        </Tooltip>
                      )}
                    </span>
                  </td>
                  <td className="px-1.5 py-2 2xl:px-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Avatar name={l.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-900">{l.name}</span>
                        <span className="block truncate font-mono text-[0.625rem] text-slate-500">{l.userId}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-1.5 py-2 2xl:px-2" onClick={(e) => e.stopPropagation()}>
                    <PQLScore score={l.pqlScore} />
                  </td>
                  <td className="px-1.5 py-2 leading-4 text-gray-700 2xl:px-2">
                    <span className="line-clamp-2">{l.reason}</span>
                  </td>
                  <td className="tabular px-1.5 py-2 2xl:px-2">
                    <span className={cx("font-semibold", l.autoApplyUsed >= l.autoApplyLimit ? "text-red-600" : "text-gray-800")}>
                      {l.autoApplyUsed}/{l.autoApplyLimit}
                    </span>
                  </td>
                  <td className="px-1.5 py-2 2xl:px-2">
                    <Badge tone={INTENT_TONE[l.pricingIntent]} size="sm">
                      {l.pricingIntent}
                    </Badge>
                  </td>
                  <td className="truncate px-1.5 py-2 whitespace-nowrap text-slate-600 2xl:px-2">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={l.isOnline ? "green" : "slate"} />
                      {l.isOnline ? "Now" : relativeTime(l.lastActiveAt, now)}
                    </span>
                  </td>
                  <td className="truncate px-1.5 py-2 text-slate-600 2xl:px-2">
                    {l.lastContactAt ? relativeTime(l.lastContactAt, now) : <span className="text-slate-400">Never</span>}
                  </td>
                  <td className="px-1.5 py-2 2xl:px-2">
                    <span
                      className={cx(
                        "inline-block max-w-full truncate rounded-md px-1.5 py-0.5 text-2xs font-medium",
                        TONES[l.statusTone].soft,
                        TONES[l.statusTone].softText
                      )}
                    >
                      {l.statusLabel}
                    </span>
                  </td>
                  <td className="py-2 pr-3 pl-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onContact(l, l.nextAction);
                      }}
                      disabled={demo || busy}
                      className={cx(
                        "focus-ring inline-flex h-7 w-full items-center justify-center gap-1 rounded-md text-2xs font-semibold text-white shadow-sm transition-[background-color,transform] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
                        l.nextAction === "whatsapp" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-brand hover:bg-brand-strong"
                      )}
                    >
                      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
                      {ACTION_LABEL[l.nextAction]}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
