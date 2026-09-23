"use client";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { TrendBadge } from "@/components/ui/TrendBadge";
import { cx, TONES } from "@/components/ui/tones";
import { setOpportunityFocus, useOpportunityFocus } from "@/components/dashboard/focus";
import { formatCurrency, formatNumber } from "@/lib/revenue-center/format";
import type { KpiCardData } from "@/lib/revenue-center/types";

function Shell({ card, children, className }: { card: KpiCardData; children: React.ReactNode; className: string }) {
  const activeFocus = useOpportunityFocus();
  const selected = card.focus !== null && activeFocus === card.focus;
  const base = cx("card group relative w-full text-left transition-[box-shadow,border-color] duration-150", className, selected && "border-brand ring-1 ring-brand/30");
  if (!card.focus) {
    return (
      <div className={base} title={card.definition}>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      title={card.definition}
      aria-pressed={selected}
      aria-label={`${card.label}: ${card.value}. Show matching revenue opportunities`}
      onClick={() => setOpportunityFocus(selected ? null : card.focus)}
      className={cx(base, "focus-ring cursor-pointer hover:border-slate-300 hover:shadow-[0_4px_12px_-4px_rgb(15_23_42/0.12)] active:scale-[0.995]")}
    >
      {children}
    </button>
  );
}

export function KPICard({ card }: { card: KpiCardData }) {
  const tone = TONES[card.tone];
  const value = card.format === "currency" ? formatCurrency(card.value) : formatNumber(card.value);
  // Long secondary text + a pill/badge will not share one line in a ~190px card: stack them.
  const accessoryLength = card.badge ? card.badge.label.length : card.changePct === null ? 0 : 7;
  const stacked = Boolean(card.secondary && accessoryLength > 0 && card.secondary.length + accessoryLength > 20);
  const accessory = card.badge ? <Badge tone={card.badge.tone}>{card.badge.label}</Badge> : <TrendBadge value={card.changePct} />;
  return (
    <Shell card={card} className="flex min-h-[6.5rem] flex-col px-3 pt-3 pb-3 2xl:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cx("inline-flex size-5 shrink-0 items-center justify-center rounded-md", tone.soft)}>
          <Icon name={card.icon} className={cx("size-3.5", tone.text)} />
        </span>
        <span className="truncate text-[0.8125rem] font-medium text-slate-700">{card.label}</span>
      </div>
      <div className="tabular mt-1.5 text-kpi font-bold tracking-tight text-gray-900">{value}</div>
      {stacked ? (
        <div className="mt-auto flex flex-col items-start gap-1 pt-0.5">
          <span className="truncate text-xs leading-4 text-slate-500">{card.secondary}</span>
          {accessory}
        </div>
      ) : (
        <div className="mt-auto flex min-w-0 items-end justify-between gap-2 pt-1">
          <span
            className={cx(
              "min-w-0 truncate text-xs leading-4",
              card.secondaryTone ? `${TONES[card.secondaryTone].softText} font-medium` : "text-slate-500"
            )}
          >
            {card.secondary}
          </span>
          <span className="shrink-0">{accessory}</span>
        </div>
      )}
    </Shell>
  );
}

export function SecondaryKPICard({ card }: { card: KpiCardData }) {
  const tone = TONES[card.tone];
  return (
    <Shell card={card} className="flex items-center gap-2.5 px-3 py-2.5 2xl:gap-3 2xl:px-4">
      <span className={cx("inline-flex size-7 shrink-0 items-center justify-center rounded-full", tone.soft)}>
        <Icon name={card.icon} className={cx("size-3.5", tone.text)} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2xs text-slate-600 2xl:text-xs">{card.label}</span>
        <span className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span className="tabular text-lg leading-6 font-bold text-gray-900">{formatNumber(card.value)}</span>
          {card.badge && <Badge tone={card.badge.tone}>{card.badge.label}</Badge>}
        </span>
      </span>
    </Shell>
  );
}

export function KPIGrid({ cards, variant = "primary" }: { cards: KpiCardData[]; variant?: "primary" | "secondary" }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">
      {cards.map((card) => (variant === "primary" ? <KPICard key={card.key} card={card} /> : <SecondaryKPICard key={card.key} card={card} />))}
    </div>
  );
}
