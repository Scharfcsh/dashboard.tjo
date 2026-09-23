"use client";

import { memo, useEffect, useRef, useState } from "react";
import { BellPlus, Ellipsis, Eye, Mail, MessageCircle, Phone, SearchX, UserPlus, Wrench, type LucideIcon } from "lucide-react";
import { LiveStatus } from "@/components/live-intelligence/LiveStatus";
import { PurchaseIntentBadge } from "@/components/live-intelligence/PurchaseIntentBadge";
import { SessionDuration } from "@/components/live-intelligence/SessionDuration";
import { UsageMeter } from "@/components/live-intelligence/UsageMeter";
import { UserActivityCell } from "@/components/live-intelligence/UserActivityCell";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { CountryBadge } from "@/components/ui/CountryBadge";
import { StatusDot } from "@/components/ui/StatusDot";
import { cx } from "@/components/ui/tones";
import { lastEventLabel, pageInfo, pricingIntent, primarySegment, quickAction, SEGMENT_META } from "@/lib/live-intelligence/derive";
import type { LiveUser, QuickAction } from "@/lib/live-intelligence/types";

export type RowAction = QuickAction | "whatsapp" | "email" | "open360" | "alert";

// Status, User, ID, Country, Page, Action, Duration, Usage, Intent, PQL, Last event, Owner, Quick action
const COLUMN_WIDTHS = [7, 13, 6, 7, 7, 10, 6.5, 6.5, 9, 4.5, 8, 7, 8.5];
const HEADERS = ["Live Status", "User", "User ID", "Country", "Current Page", "Current Action", "Session Duration", "Auto Applies Used", "Pricing Intent", "PQL Score", "Last Event", "Sales Owner", "Quick Action"];

// Only monetization/lifecycle signals earn a badge next to the name.
const BADGE_SEGMENTS = new Set(["quota_exhausted", "checkout_intent", "near_limit", "pql", "paid", "resurrected", "new"]);

const QUICK: Record<QuickAction, { label: string; icon: LucideIcon }> = {
  call: { label: "Call", icon: Phone },
  assign: { label: "Assign", icon: UserPlus },
  investigate: { label: "Investigate", icon: Wrench },
  view: { label: "View", icon: Eye },
};

function RowMenu({ user, onAction }: { user: LiveUser; onAction: (u: LiveUser, a: RowAction) => void }) {
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
  const items: { label: string; icon: LucideIcon; action: RowAction }[] = [
    { label: "Call", icon: Phone, action: "call" },
    { label: "WhatsApp", icon: MessageCircle, action: "whatsapp" },
    { label: "Email", icon: Mail, action: "email" },
    { label: "Assign to sales", icon: UserPlus, action: "assign" },
    { label: "Open User 360", icon: Eye, action: "open360" },
    { label: "Create alert", icon: BellPlus, action: "alert" },
  ];
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`More actions for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring inline-flex size-7 items-center justify-center rounded-md border border-line text-slate-500 hover:bg-slate-50 hover:text-gray-900"
      >
        <Ellipsis className="size-3.5 rotate-90" aria-hidden />
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
                onAction(user, item.action);
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

const Row = memo(function Row({
  user,
  selected,
  onSelect,
  onAction,
}: {
  user: LiveUser;
  selected: boolean;
  onSelect: (u: LiveUser) => void;
  onAction: (u: LiveUser, a: RowAction) => void;
}) {
  const segment = primarySegment(user);
  const intent = pricingIntent(user);
  const quick = QUICK[quickAction(user)];
  const quickKey = quickAction(user);
  const page = pageInfo(user.currentPage);
  return (
    <tr
      onClick={() => onSelect(user)}
      aria-selected={selected}
      className={cx(
        "group cursor-pointer border-b border-slate-100 text-2xs transition-colors last:border-b-0 2xl:text-xs",
        selected ? "bg-teal-50/70 shadow-[inset_3px_0_0_0_#0d9488]" : "hover:bg-slate-50/80"
      )}
    >
      <td className="py-2 pr-1.5 pl-4">
        <LiveStatus isOnline={user.isOnline} lastSeenAt={user.lastSeenAt} />
      </td>
      <td className="px-1.5 py-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(user);
          }}
          aria-label={`Preview live session for ${user.name}`}
          className="focus-ring flex max-w-full min-w-0 items-center gap-2 rounded text-left"
        >
          <Avatar name={user.name} size="sm" className="2xl:size-7" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-gray-900">{user.name}</span>
            {BADGE_SEGMENTS.has(segment) && (
              <Badge tone={SEGMENT_META[segment].tone} size="sm" className="mt-0.5 !px-1 !py-0 !text-[0.5625rem] leading-3.5">
                {SEGMENT_META[segment].label}
              </Badge>
            )}
          </span>
        </button>
      </td>
      <td className="truncate px-1.5 py-2 font-mono text-[0.625rem] text-slate-500" title={user.displayId}>
        {user.displayId}
      </td>
      <td className="truncate px-1.5 py-2">
        <CountryBadge code={user.country} />
      </td>
      <td className="truncate px-1.5 py-2 text-slate-600" title={user.currentPage ?? undefined}>
        {page.label}
      </td>
      <td className="px-1.5 py-2">
        <UserActivityCell user={user} />
      </td>
      <td className="px-1.5 py-2">
        <SessionDuration startedAt={user.sessionStartedAt} lastSeenAt={user.lastSeenAt} isOnline={user.isOnline} className="tabular font-semibold whitespace-nowrap text-gray-900" />
      </td>
      <td className="px-1.5 py-2" onClick={(e) => e.stopPropagation()}>
        <UsageMeter used={user.autoAppliesUsed} limit={user.autoApplyLimit} />
      </td>
      <td className="px-1.5 py-2">
        <PurchaseIntentBadge intent={intent} />
      </td>
      <td className="px-1.5 py-2" onClick={(e) => e.stopPropagation()}>
        <PQLScore score={user.pqlScore} size={28} />
      </td>
      <td className="truncate px-1.5 py-2 text-gray-700" title={lastEventLabel(user.lastEventName)}>
        {lastEventLabel(user.lastEventName)}
      </td>
      <td className="truncate px-1.5 py-2 text-gray-700">{user.ownerName ?? <span className="text-slate-400">{user.priority ? "Unassigned" : "—"}</span>}</td>
      <td className="py-2 pr-3 pl-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={`${quick.label} ${user.name}`}
            aria-label={`${quick.label} ${user.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onAction(user, quickKey);
            }}
            className={cx(
              "focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center gap-1 rounded-md border text-2xs font-semibold transition-colors min-[112.5rem]:w-auto min-[112.5rem]:min-w-0 min-[112.5rem]:flex-1 min-[112.5rem]:px-1.5 min-[112.5rem]:text-xs",
              quickKey === "investigate" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-line text-teal-700 hover:border-teal-200 hover:bg-teal-50"
            )}
          >
            <quick.icon className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden truncate min-[112.5rem]:inline">{quick.label}</span>
          </button>
          <RowMenu user={user} onAction={onAction} />
        </div>
      </td>
    </tr>
  );
});

export function ActiveUsersTable({
  users,
  total,
  onlineCount,
  selectedId,
  onSelect,
  onAction,
  onClearFilters,
  pending,
}: {
  users: LiveUser[];
  total: number;
  onlineCount: number;
  selectedId: string | null;
  onSelect: (u: LiveUser) => void;
  onAction: (u: LiveUser, a: RowAction) => void;
  onClearFilters: () => void;
  pending: boolean;
}) {
  return (
    <section aria-labelledby="active-users-title" className="card flex min-w-0 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <h2 id="active-users-title" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <StatusDot tone="green" pulse />
          Users Active Right Now
          <span className="font-normal text-slate-500">
            ({users.length} {users.length === 1 ? "user" : "users"})
          </span>
        </h2>
        <span className="text-2xs text-slate-400">
          {onlineCount} online · {total} active in window
        </span>
      </header>
      <div className={cx("overflow-x-auto transition-opacity", pending && "opacity-60")}>
        <table className="w-full min-w-[900px] table-fixed border-collapse">
          <colgroup>
            {COLUMN_WIDTHS.map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[0.625rem] text-slate-500 2xl:text-2xs">
              {HEADERS.map((h, i) => (
                <th key={h} scope="col" className={cx("px-1.5 py-2 align-bottom leading-3.5 font-medium", i === 0 && "pl-4")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Row key={u.userId} user={u} selected={u.userId === selectedId} onSelect={onSelect} onAction={onAction} />
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <SearchX className="size-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-semibold text-gray-900">No users match these filters</p>
            <p className="mt-1 text-xs text-slate-500">Try changing your filters or search criteria.</p>
            <button type="button" onClick={onClearFilters} className="focus-ring mt-4 inline-flex h-8 items-center rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong">
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
