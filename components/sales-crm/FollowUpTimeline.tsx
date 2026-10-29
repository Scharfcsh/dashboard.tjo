"use client";

import { SectionCard } from "@/components/dashboard/SectionCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useNow } from "@/components/ui/Now";
import { cx } from "@/components/ui/tones";
import { timeUntil } from "@/lib/sales-crm/derive";
import { formatClock } from "@/lib/revenue-center/format";
import type { FollowUp } from "@/lib/sales-crm/types";

export function FollowUpTimeline({
  followUps,
  team,
  onSelect,
}: {
  followUps: FollowUp[];
  team: boolean;
  onSelect: (leadId: string) => void;
}) {
  const now = useNow();

  return (
    <SectionCard
      title="Today's Follow-Ups"
      info={`Callbacks ${team ? "anyone on the team" : "you"} scheduled that are due before the end of today. A callback that is due sorts to the top of the queue.`}
      actions={<span className="tabular text-2xs text-slate-500">{followUps.length}</span>}
    >
      {followUps.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-500">No callbacks are due today.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-slate-200 pl-4">
          {followUps.map((f) => (
            <li key={f.callbackId} className="relative">
              <span
                className={cx(
                  "absolute top-1.5 -left-[1.3125rem] size-2 rounded-full ring-2 ring-white",
                  f.isDue ? "bg-red-500" : "bg-brand"
                )}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => onSelect(f.leadId)}
                className="focus-ring block w-full rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="tabular text-2xs font-semibold text-gray-900">{formatClock(f.dueAt)}</span>
                  <Avatar name={f.name} size="sm" />
                  <span className="truncate text-xs font-medium text-gray-900">{f.name}</span>
                  {f.isDue ? (
                    <Badge tone="red" size="sm">Due now</Badge>
                  ) : (
                    <span className="text-2xs text-slate-400">{timeUntil(f.dueAt, now)}</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-2xs text-slate-500" title={f.notes ?? f.reason ?? ""}>
                  {f.notes ?? f.reason ?? "No note"}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
