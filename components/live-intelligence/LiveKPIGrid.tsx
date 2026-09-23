"use client";

import { Flame, Radio, ShoppingCart, TriangleAlert, UserRound, FileText, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/components/ui/tones";
import { formatNumber } from "@/lib/revenue-center/format";
import type { LiveKpis } from "@/lib/live-intelligence/types";

export type KpiAction = "online" | "pricing" | "near_limit" | "high_intent";

interface Card {
  key: string;
  label: string;
  value: number;
  secondary: string;
  icon: LucideIcon;
  tile: string;
  badge?: string;
  pulse?: boolean;
  action?: KpiAction;
  definition: string;
}

export function LiveKPIGrid({ kpis, onSelect, active }: { kpis: LiveKpis; onSelect: (a: KpiAction) => void; active: KpiAction | null }) {
  const cards: Card[] = [
    { key: "online", label: "Online Now", value: kpis.onlineNow, secondary: "Users active on site", icon: Radio, tile: "bg-emerald-50 text-emerald-600", pulse: true, action: "online", definition: "Users whose last activity is within the online window (5 minutes)." },
    { key: "active", label: "Active Today", value: kpis.activeToday, secondary: `${formatNumber(kpis.active7d)} active last 7 days`, icon: UserRound, tile: "bg-blue-50 text-blue-500", definition: "Distinct users with a meaningful product action today." },
    { key: "sessions", label: "Sessions Today", value: kpis.sessionsToday, secondary: "Total user sessions", icon: FileText, tile: "bg-violet-50 text-violet-500", definition: "Browser sessions started today (30 idle minutes ends a session)." },
    { key: "intent", label: "High Intent Active", value: kpis.highIntentActive, secondary: "Viewed pricing or checkout", icon: Flame, tile: "bg-orange-50 text-orange-500", badge: "Hot", action: "high_intent", definition: "Active-today unpaid users with a P0/P1 routing priority or PQL score 75+." },
    { key: "pricing", label: "Pricing Activity", value: kpis.pricingActivity, secondary: "Users in pricing flow", icon: ShoppingCart, tile: "bg-emerald-50 text-emerald-600", action: "pricing", definition: "Active-today users who opened pricing today." },
    { key: "limit", label: "Users Near Free Limit", value: kpis.nearFreeLimit, secondary: "45+ auto applies used", icon: TriangleAlert, tile: "bg-red-50 text-red-500", action: "near_limit", definition: "Active-today unpaid users with 45 or more free Auto Applies used." },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">
      {cards.map((c) => {
        const selected = c.action !== undefined && active === c.action;
        const body = (
          <>
            <span className={cx("relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg 2xl:size-10", c.tile)}>
              <c.icon className="size-4.5 2xl:size-5" strokeWidth={2} aria-hidden />
              {c.pulse && <span className="absolute -top-0.5 -right-0.5 size-2 animate-ping rounded-full bg-emerald-400/70" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block text-[0.5625rem] leading-3 font-medium tracking-wide text-slate-500 uppercase 2xl:text-[0.625rem]">{c.label}</span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <span className="tabular text-2xl leading-7 font-bold tracking-tight text-gray-900 2xl:text-kpi">{formatNumber(c.value)}</span>
                {c.badge && (
                  <Badge tone="red" size="sm" className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
                    {c.badge}
                  </Badge>
                )}
              </span>
              <span className="line-clamp-2 block text-[0.625rem] leading-3 text-slate-500 2xl:text-2xs 2xl:leading-4">{c.secondary}</span>
            </span>
          </>
        );
        const className = cx(
          "card flex w-full items-center gap-2 px-2.5 py-2.5 text-left transition-[box-shadow,border-color] 2xl:gap-3 2xl:px-4 2xl:py-3",
          selected && "border-brand ring-1 ring-brand/30"
        );
        return c.action ? (
          <button
            key={c.key}
            type="button"
            title={c.definition}
            aria-pressed={selected}
            onClick={() => onSelect(c.action!)}
            className={cx(className, "focus-ring cursor-pointer hover:border-slate-300 hover:shadow-[0_4px_12px_-4px_rgb(15_23_42/0.12)]")}
          >
            {body}
          </button>
        ) : (
          <div key={c.key} title={c.definition} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
