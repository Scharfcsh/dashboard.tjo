"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CalendarCheck,
  Ellipsis,
  Mail,
  MessageCircle,
  Phone,
  RotateCcw,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { FOCUS_LABELS, matchesFocus, setOpportunityFocus, useOpportunityFocus } from "@/components/dashboard/focus";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { User360Drawer, type DrawerIntent } from "@/components/users/User360Drawer";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { CountryBadge } from "@/components/ui/CountryBadge";
import { useNow } from "@/components/ui/Now";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import { relativeTime } from "@/lib/revenue-center/format";
import type { CheckoutStatus, OpportunityRow, PrimaryAction, Tone } from "@/lib/revenue-center/types";

type SortKey = "name" | "country" | "activity" | "usage" | "pricing" | "checkout" | "pql" | "owner" | "contact";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const CHECKOUT_ORDER: Record<CheckoutStatus, number> = { not_started: 0, plan_selected: 1, started: 2, abandoned: 3 };
const CHECKOUT_TONE: Record<CheckoutStatus, Tone> = { not_started: "slate", plan_selected: "green", started: "red", abandoned: "red" };

const ACTIONS: Record<PrimaryAction, { label: string; icon: LucideIcon; className: string; intent: DrawerIntent }> = {
  call_now: { label: "Call now", icon: Phone, className: "bg-red-500 hover:bg-red-600", intent: "call" },
  follow_up: { label: "Follow up", icon: CalendarCheck, className: "bg-blue-500 hover:bg-blue-600", intent: "follow_up" },
  recover: { label: "Recover", icon: RotateCcw, className: "bg-orange-500 hover:bg-orange-600", intent: "recover" },
};

const SORTERS: Record<SortKey, (r: OpportunityRow) => number | string> = {
  name: (r) => r.name.toLowerCase(),
  country: (r) => r.country ?? "zz",
  activity: (r) => (r.isOnline ? Number.MAX_SAFE_INTEGER : r.lastSeenAt ? Date.parse(r.lastSeenAt) : 0),
  usage: (r) => r.autoApplyUsed,
  pricing: (r) => r.pricingViews,
  checkout: (r) => CHECKOUT_ORDER[r.checkoutStatus],
  pql: (r) => r.pqlScore,
  owner: (r) => (r.ownerName ?? "zzz").toLowerCase(),
  contact: (r) => (r.lastContactAt ? Date.parse(r.lastContactAt) : 0),
};

// User, ID, Country, Activity, Usage, Pricing, Checkout, PQL, Why Hot, Owner, Contact, Action
const COLUMN_WIDTHS = [12.5, 6.5, 7, 8.5, 6.5, 5.5, 8.5, 5.5, 13, 7.5, 6.5, 12.5];

function usageTone(used: number, limit: number): Tone {
  if (used >= limit) return "red";
  if (used >= 45) return "orange";
  if (used >= 40) return "amber";
  return "slate";
}

function SortHeader({ label, sortKey, sort, onSort, className }: { label: string; sortKey: SortKey; sort: SortState; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort?.key === sortKey;
  const Arrow = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cx("px-1.5 py-2 2xl:px-2 align-bottom font-medium 2xl:whitespace-nowrap", className)}>
      <button type="button" onClick={() => onSort(sortKey)} className="focus-ring group inline-flex items-center gap-1 rounded text-left hover:text-gray-900 2xl:whitespace-nowrap">
        {label}
        <Arrow className={cx("size-3", active ? "text-brand" : "text-slate-300 opacity-0 group-hover:opacity-100")} aria-hidden />
      </button>
    </th>
  );
}

function RowMenu({ row, onPick }: { row: OpportunityRow; onPick: (intent: DrawerIntent) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const items: { label: string; icon: LucideIcon; intent: DrawerIntent }[] = [
    { label: "Call", icon: Phone, intent: "call" },
    { label: "WhatsApp", icon: MessageCircle, intent: "whatsapp" },
    { label: "Email", icon: Mail, intent: "email" },
    { label: "Assign owner", icon: UserPlus, intent: "assign" },
  ];
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`More actions for ${row.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-gray-900"
      >
        <Ellipsis className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-40 mt-1 w-44 animate-fade-in rounded-lg border border-line bg-white p-1 shadow-pop">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(item.intent);
              }}
              className="focus-ring flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              <item.icon className="size-3.5 text-slate-400" aria-hidden />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RevenueOpportunityTable({ rows, total, demo }: { rows: OpportunityRow[]; total: number; demo: boolean }) {
  const now = useNow();
  const focus = useOpportunityFocus();
  const [sort, setSort] = useState<SortState>(null);
  const [drawer, setDrawer] = useState<{ userId: string; intent: DrawerIntent } | null>(null);

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => matchesFocus(focus, r));
    if (!sort) return filtered;
    const get = SORTERS[sort.key];
    return [...filtered].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, focus, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s?.key !== key ? { key, dir: key === "name" || key === "country" || key === "owner" ? "asc" : "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null));

  const open = (userId: string, intent: DrawerIntent = "profile") => setDrawer({ userId, intent });

  return (
    <>
      <SectionCard
        id="opportunities"
        title="Today's Highest Revenue Opportunities"
        info="Unpaid users with a routing priority or PQL score 60+, most urgent first. Click a row for the full User 360."
        className="scroll-mt-4"
        actions={
          <>
            {focus && (
              <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft py-0.5 pr-1 pl-2 text-2xs font-medium text-brand-strong">
                {FOCUS_LABELS[focus]}
                <button type="button" aria-label="Clear filter" onClick={() => setOpportunityFocus(null)} className="focus-ring rounded p-0.5 hover:bg-teal-100">
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            )}
            <span className="hidden text-2xs text-slate-400 sm:inline">
              {visible.length} of {total}
            </span>
            <Link href="/pql-leads" className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-brand hover:text-brand-strong">
              View all opportunities <ArrowRight className="size-3" aria-hidden />
            </Link>
          </>
        }
        bodyClassName="px-0 pb-1"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] table-fixed border-collapse text-xs">
            <colgroup>
              {COLUMN_WIDTHS.map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-2xs text-slate-500">
                <SortHeader label="User" sortKey="name" sort={sort} onSort={onSort} className="pl-4" />
                <th scope="col" className="px-1.5 py-2 2xl:px-2 font-medium">User ID</th>
                <SortHeader label="Country" sortKey="country" sort={sort} onSort={onSort} />
                <SortHeader label="Current Activity" sortKey="activity" sort={sort} onSort={onSort} />
                <SortHeader label="Auto Apply Usage" sortKey="usage" sort={sort} onSort={onSort} />
                <SortHeader label="Pricing Views" sortKey="pricing" sort={sort} onSort={onSort} />
                <SortHeader label="Checkout Status" sortKey="checkout" sort={sort} onSort={onSort} />
                <SortHeader label="PQL Score" sortKey="pql" sort={sort} onSort={onSort} />
                <th scope="col" className="px-1.5 py-2 2xl:px-2 font-medium">Why Hot</th>
                <SortHeader label="Sales Owner" sortKey="owner" sort={sort} onSort={onSort} />
                <SortHeader label="Last Contact" sortKey="contact" sort={sort} onSort={onSort} />
                <th scope="col" className="py-2 pr-4 pl-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-xs text-slate-500">
                    {focus ? (
                      <>
                        No opportunities match “{FOCUS_LABELS[focus]}”.{" "}
                        <button type="button" onClick={() => setOpportunityFocus(null)} className="focus-ring rounded font-medium text-brand">
                          Clear filter
                        </button>
                      </>
                    ) : (
                      "No unpaid users are showing purchase intent right now."
                    )}
                  </td>
                </tr>
              )}
              {visible.map((r) => {
                const action = ACTIONS[r.action];
                const urgent = r.priority === "P0";
                return (
                  <tr
                    key={r.userId}
                    onClick={() => open(r.userId)}
                    className={cx(
                      "group cursor-pointer border-b border-slate-100 transition-colors last:border-b-0",
                      urgent ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-slate-50/80"
                    )}
                  >
                    <td className={cx("py-2 pr-2 pl-4", urgent && "shadow-[inset_3px_0_0_0_#ef4444]")}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(r.userId);
                        }}
                        className="focus-ring flex max-w-full min-w-0 items-center gap-1.5 rounded text-left 2xl:gap-2"
                        aria-label={`Open User 360 for ${r.name}`}
                      >
                        <Avatar name={r.name} size="sm" className="2xl:size-7" />
                        <span className="truncate font-semibold text-gray-900">{r.name}</span>
                      </button>
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <span className="block truncate font-mono text-2xs text-slate-500" title={r.displayId}>
                        {r.displayId}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <CountryBadge code={r.country} />
                    </td>
                    <td className="truncate px-1.5 py-2 2xl:px-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <StatusDot tone={r.isOnline ? "green" : "slate"} />
                        {r.isOnline ? "Active now" : relativeTime(r.lastSeenAt, now)}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <Badge tone={usageTone(r.autoApplyUsed, r.autoApplyLimit)} className="tabular font-semibold">
                        {r.autoApplyUsed}/{r.autoApplyLimit}
                      </Badge>
                    </td>
                    <td className="tabular px-1.5 py-2 2xl:px-2 text-gray-800">{r.pricingViews}</td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <Badge tone={CHECKOUT_TONE[r.checkoutStatus]} size="sm" className="max-w-full truncate 2xl:text-xs">
                        {r.checkoutLabel}
                      </Badge>
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2" onClick={(e) => e.stopPropagation()}>
                      <PQLScore score={r.pqlScore} />
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2 leading-4 text-gray-700">
                      <span className="line-clamp-2">{r.whyHot}</span>
                    </td>
                    <td className="truncate px-1.5 py-2 2xl:px-2 text-gray-700">{r.ownerName ?? <span className="text-slate-400">Unassigned</span>}</td>
                    <td className="truncate px-1.5 py-2 2xl:px-2 text-slate-600">{r.lastContactAt ? relativeTime(r.lastContactAt, now) : <span className="text-slate-400">Never</span>}</td>
                    <td className="py-2 pr-3 pl-2">
                      <div className="flex items-center gap-1">
                        <Tooltip content={`${action.label} — opens ${r.name}'s User 360`} align="end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              open(r.userId, action.intent);
                            }}
                            className={cx(
                              "focus-ring inline-flex h-7 w-[5.75rem] items-center justify-center gap-1.5 rounded-md text-2xs font-semibold tracking-wide text-white uppercase shadow-sm transition-[background-color,transform] active:scale-[0.97]",
                              action.className
                            )}
                          >
                            <action.icon className="size-3" strokeWidth={2.5} aria-hidden />
                            {action.label}
                          </button>
                        </Tooltip>
                        <RowMenu row={r} onPick={(intent) => open(r.userId, intent)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {drawer && (
        <User360Drawer key={drawer.userId} userId={drawer.userId} intent={drawer.intent} demo={demo} onClose={() => setDrawer(null)} />
      )}
    </>
  );
}
