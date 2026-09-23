"use client";

import { useState } from "react";
import { ArrowRight, BadgeIndianRupee, CircleX, FileText, Flame, ShoppingCart, TriangleAlert, UserRoundCheck, type LucideIcon } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { useNow } from "@/components/ui/Now";
import { cx } from "@/components/ui/tones";
import { compactAgo } from "@/lib/revenue-center/format";
import type { EventCategory, LiveEvent } from "@/lib/live-intelligence/types";

const CATEGORY: Record<EventCategory, { label: string; icon: LucideIcon; className: string }> = {
  opportunity: { label: "Opportunity", icon: Flame, className: "text-orange-500" },
  high_intent: { label: "High intent", icon: ShoppingCart, className: "text-emerald-600" },
  conversion: { label: "Conversion", icon: BadgeIndianRupee, className: "text-emerald-600" },
  activation: { label: "Activation", icon: FileText, className: "text-blue-500" },
  retention: { label: "Retention", icon: UserRoundCheck, className: "text-violet-500" },
  product_issue: { label: "Product issue", icon: TriangleAlert, className: "text-red-500" },
  revenue_recovery: { label: "Revenue recovery", icon: CircleX, className: "text-red-500" },
};

export function ImportantEventsStream({ events, onSelectUser }: { events: LiveEvent[]; onSelectUser: (userId: string) => void }) {
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, 6);
  return (
    <SectionCard
      title="Important Events Stream"
      info="Only commercially or operationally meaningful events — no clicks or page views."
      actions={
        events.length > 6 && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-brand hover:text-brand-strong">
            {expanded ? "Show less" : "View all"} <ArrowRight className={cx("size-3 transition-transform", expanded && "-rotate-90")} aria-hidden />
          </button>
        )
      }
      bodyClassName="pt-0.5"
    >
      {events.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">No important events in the last 7 days.</p>
      ) : (
        <ul className="divide-y divide-slate-100" aria-live="polite">
          {visible.map((e) => {
            const c = CATEGORY[e.category];
            return (
              <li key={e.id} className="animate-fade-in">
                <button
                  type="button"
                  disabled={!e.userId}
                  onClick={() => e.userId && onSelectUser(e.userId)}
                  className="focus-ring flex w-full items-center gap-2.5 rounded py-[0.3125rem] text-left enabled:hover:bg-slate-50"
                  title={`${c.label}: ${e.displayId} ${e.text}`}
                >
                  <c.icon className={cx("size-4 shrink-0", c.className)} aria-hidden />
                  <span className="sr-only">{c.label}:</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-800">
                    <span className="font-medium">{e.displayId}</span> {e.text}
                  </span>
                  <time dateTime={e.at} className="tabular shrink-0 text-2xs text-slate-400">
                    {compactAgo(e.at, now)}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
