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
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  RotateCcw,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { useFilterPatch } from "@/components/pql-intelligence/useFilterPatch";
import { User360Drawer, type DrawerIntent } from "@/components/users/User360Drawer";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { CountryBadge } from "@/components/ui/CountryBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx, TONES } from "@/components/ui/tones";
import { activeLeadFilterCount } from "@/lib/pql-intelligence/filters";
import type { LeadAction, PqlFilters, UpgradeLead } from "@/lib/pql-intelligence/types";
import { formatNumber, formatPercent } from "@/lib/revenue-center/format";
import type { Tone } from "@/lib/revenue-center/types";

// The upgrade queue. Every row carries its lead reason (SOP 11 acceptance
// criterion) and a single call to action; usage and remaining come from the
// same ledger figure, so they cannot disagree.

type SortKey = "priority" | "name" | "usage" | "success" | "remaining" | "pricing" | "pql" | "owner";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const ACTIONS: Record<LeadAction, { label: string; icon: LucideIcon; className: string; intent: DrawerIntent }> = {
  call_now: { label: "Call now", icon: Phone, className: "bg-red-500 hover:bg-red-600", intent: "call" },
  contact: { label: "Contact", icon: MessageCircle, className: "bg-brand hover:bg-brand-strong", intent: "whatsapp" },
  follow_up: { label: "Follow up", icon: CalendarCheck, className: "bg-blue-500 hover:bg-blue-600", intent: "follow_up" },
  recover: { label: "Recover", icon: RotateCcw, className: "bg-orange-500 hover:bg-orange-600", intent: "recover" },
};

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

const SORTERS: Record<SortKey, (r: UpgradeLead) => number | string> = {
  priority: (r) => PRIORITY_RANK[r.priority ?? ""] ?? 9,
  name: (r) => r.name.toLowerCase(),
  usage: (r) => r.autoApplyUsed,
  success: (r) => r.successRatePct ?? -1,
  remaining: (r) => r.remaining,
  pricing: (r) => r.pricingViews,
  pql: (r) => r.pqlScore,
  owner: (r) => (r.ownerName ?? "zzz").toLowerCase(),
};

// Priority, User, User ID, Country, Auto Applies, Success, Remaining, Pricing,
// Plan, Checkout, PQL, Lead Reason, Owner, Action
// Percentages, summing to 100. Action needs room for a labelled button plus
// the row menu; Lead Reason needs two readable lines.
const COLUMN_WIDTHS = [4, 11.5, 6.5, 7, 6.5, 5.2, 6, 5.3, 5.5, 8.5, 4.5, 11.3, 7.2, 11];

function usageTone(used: number, limit: number): Tone {
  if (used >= limit) return "red";
  if (used >= 45) return "orange";
  if (used >= 40) return "amber";
  return "slate";
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const Arrow = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className="px-1.5 py-2 align-bottom font-medium 2xl:px-2 2xl:whitespace-nowrap"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="focus-ring group inline-flex items-center gap-1 rounded text-left hover:text-gray-900"
      >
        {label}
        <Arrow className={cx("size-3", active ? "text-brand" : "text-slate-300 opacity-0 group-hover:opacity-100")} aria-hidden />
      </button>
    </th>
  );
}

function RowMenu({ row, onPick }: { row: UpgradeLead; onPick: (intent: DrawerIntent) => void }) {
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
        <div role="menu" className="absolute top-full right-0 z-40 mt-1 w-48 animate-fade-in rounded-lg border border-line bg-white p-1 shadow-pop">
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
          <Link
            href={`/user-intelligence/${encodeURIComponent(row.userId)}`}
            role="menuitem"
            className="focus-ring flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="size-3.5 text-slate-400" aria-hidden />
            Open full profile
          </Link>
        </div>
      )}
    </div>
  );
}

export function HotLeadTable({
  rows,
  total,
  filters,
  demo,
}: {
  rows: UpgradeLead[];
  total: number;
  filters: PqlFilters;
  demo: boolean;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [drawer, setDrawer] = useState<{ userId: string; intent: DrawerIntent } | null>(null);
  const { clearLeadFilters, pending } = useFilterPatch(filters);
  const activeFilters = activeLeadFilterCount(filters);

  const visible = useMemo(() => {
    if (!sort) return rows;
    const get = SORTERS[sort.key];
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }));

  const open = (userId: string, intent: DrawerIntent = "profile") => setDrawer({ userId, intent });

  return (
    <>
      <SectionCard
        id="upgrade-leads"
        title="Highest Priority Upgrade Leads"
        info="Unpaid users with a routing priority or a qualifying PQL score, most urgent first. Every row shows why it qualified. Filtered by the usage, score, intent, owner and lead-status controls in the header."
        actions={
          <span className="flex items-center gap-2">
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={clearLeadFilters}
                className="focus-ring inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-2xs font-medium text-brand-strong hover:bg-teal-100"
              >
                {activeFilters} filter{activeFilters === 1 ? "" : "s"} active
                <X className="size-3" aria-hidden />
              </button>
            )}
            <span className="tabular hidden text-2xs whitespace-nowrap text-slate-500 sm:inline">
              {formatNumber(visible.length)} of {formatNumber(total)}
            </span>
            <Link
              href="/user-intelligence"
              className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-brand hover:text-brand-strong"
            >
              View all leads <ArrowRight className="size-3" aria-hidden />
            </Link>
          </span>
        }
        bodyClassName={cx("min-h-0 flex-1 px-0 pb-1 transition-opacity", pending && "opacity-60")}
      >
        <div className="max-h-[32rem] overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[60rem] table-fixed border-collapse text-xs">
            <colgroup>
              {COLUMN_WIDTHS.map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50 text-left text-2xs text-slate-500">
                <SortHeader label="Priority" sortKey="priority" sort={sort} onSort={onSort} />
                <SortHeader label="User" sortKey="name" sort={sort} onSort={onSort} />
                <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">User ID</th>
                <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Country</th>
                <SortHeader label="Auto Applies" sortKey="usage" sort={sort} onSort={onSort} />
                <SortHeader label="Success Rate" sortKey="success" sort={sort} onSort={onSort} />
                <SortHeader label="Remaining" sortKey="remaining" sort={sort} onSort={onSort} />
                <SortHeader label="Pricing Views" sortKey="pricing" sort={sort} onSort={onSort} />
                <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Plan Click</th>
                <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Checkout</th>
                <SortHeader label="PQL" sortKey="pql" sort={sort} onSort={onSort} />
                <th scope="col" className="px-1.5 py-2 font-medium 2xl:px-2">Lead Reason</th>
                <SortHeader label="Owner" sortKey="owner" sort={sort} onSort={onSort} />
                <th scope="col" className="py-2 pr-4 pl-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-xs text-slate-500">
                    {activeFilters > 0 ? (
                      <>
                        No upgrade leads match the active filters.{" "}
                        <button type="button" onClick={clearLeadFilters} className="focus-ring rounded font-medium text-brand">
                          Clear them
                        </button>
                      </>
                    ) : (
                      "No unpaid users currently qualify as upgrade leads."
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
                    <td className={cx("py-2 pr-1.5 pl-4", urgent && "shadow-[inset_3px_0_0_0_#ef4444]")}>
                      {r.priority ? (
                        <Badge tone={r.priority === "P0" ? "red" : r.priority === "P1" ? "amber" : "slate"} size="sm" className="font-semibold">
                          {r.priority}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(r.userId);
                        }}
                        className="focus-ring flex max-w-full min-w-0 items-center gap-1.5 rounded text-left"
                        aria-label={`Open User 360 for ${r.name}`}
                      >
                        <Avatar name={r.name} size="sm" />
                        <span className="truncate font-semibold text-gray-900">{r.name}</span>
                      </button>
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <span className="block truncate font-mono text-2xs text-slate-500" title={r.userId}>
                        {r.userId}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <CountryBadge code={r.country} />
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <Badge tone={usageTone(r.autoApplyUsed, r.autoApplyLimit)} className="tabular font-semibold">
                        {r.autoApplyUsed}/{r.autoApplyLimit}
                      </Badge>
                    </td>
                    <td className="tabular px-1.5 py-2 text-gray-800 2xl:px-2">
                      {r.successRatePct === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <Tooltip content={`${formatNumber(r.successCount)} successful of ${formatNumber(r.autoApplyUsed)} used`}>
                          <span tabIndex={0} className="focus-ring rounded">
                            {formatPercent(r.successRatePct, 0)}
                          </span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="tabular px-1.5 py-2 2xl:px-2">
                      <span className={cx("font-semibold", r.remaining === 0 ? "text-red-600" : "text-gray-800")}>{r.remaining}</span>
                    </td>
                    <td className="tabular px-1.5 py-2 text-gray-800 2xl:px-2">{r.pricingViews}</td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      {r.planClicked ? (
                        <Badge tone={r.planClicked === "Premium" ? "purple" : "blue"} size="sm">
                          {r.planClicked}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2">
                      <span
                        className={cx(
                          "inline-block max-w-full truncate rounded-md px-1.5 py-0.5 text-2xs font-medium",
                          TONES[r.checkoutTone].soft,
                          TONES[r.checkoutTone].softText
                        )}
                      >
                        {r.checkoutLabel}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 2xl:px-2" onClick={(e) => e.stopPropagation()}>
                      <PQLScore score={r.pqlScore} />
                    </td>
                    <td className="px-1.5 py-2 leading-4 text-gray-700 2xl:px-2">
                      <span className="line-clamp-2">{r.reason}</span>
                    </td>
                    <td className="truncate px-1.5 py-2 text-gray-700 2xl:px-2">
                      {r.ownerName ?? <span className="text-slate-400">Unassigned</span>}
                    </td>
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
                              "focus-ring inline-flex h-7 w-[5.4rem] items-center justify-center gap-1 rounded-md text-2xs font-semibold tracking-wide text-white uppercase shadow-sm transition-[background-color,transform] active:scale-[0.97]",
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
