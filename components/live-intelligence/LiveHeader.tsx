"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import type { DataSource } from "@/lib/revenue-center/types";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });

export function LiveHeader({ source, updatedAt }: { source: DataSource; updatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const live = source.kind === "live";
  return (
    <PageHeader title="Live User Intelligence" subtitle="Understand every active user's behaviour, current session and monetization intent in real time.">
      <div className="flex items-center gap-3">
        <Tooltip content={live ? "Presence refreshes as events arrive; this view polls every 20 seconds." : source.reason} side="bottom">
          <span
            tabIndex={0}
            className={cx(
              "focus-ring inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium",
              live ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            )}
          >
            <StatusDot tone={live ? "green" : "amber"} pulse />
            {live ? "Live Data" : "Demo data"}
          </span>
        </Tooltip>
        <span className="tabular text-2xs whitespace-nowrap text-slate-500" aria-live="polite">
          Updated {clock(updatedAt)}
        </span>
        <Tooltip content="Refresh now" side="bottom" align="end">
          <button
            type="button"
            aria-label="Refresh live data"
            onClick={() => startTransition(() => router.refresh())}
            className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-gray-900 active:scale-95"
          >
            <RefreshCw className={cx("size-4", pending && "animate-spin")} aria-hidden />
          </button>
        </Tooltip>
      </div>
    </PageHeader>
  );
}
