"use client";

import { useState } from "react";
import { TriangleAlert, X, Zap } from "lucide-react";
import { NEXT_ACTION_LABEL } from "@/lib/live-intelligence/derive";
import type { ProfileUser } from "@/lib/user-360/types";

const PRIORITY_COPY: Record<string, { chip: string; headline: string }> = {
  P0: { chip: "P0 – Immediate", headline: "CALL NOW — HIGH PURCHASE INTENT" },
  P1: { chip: "P1 – Today", headline: "FOLLOW UP TODAY — STRONG INTENT" },
  P2: { chip: "P2 – Nurture", headline: "NURTURE — EARLY VALUE SIGNAL" },
};

const SLA_COPY: Record<string, string> = { P0: "Contact within 15 minutes", P1: "Contact within 8 hours", P2: "Nurture in the next campaign" };

/** Shown only when scoring assigned a routing priority (SOP 5.3). */
export function NextBestActionBanner({ user }: { user: ProfileUser }) {
  const [dismissed, setDismissed] = useState(false);
  if (!user.priority || dismissed) return null;
  const copy = PRIORITY_COPY[user.priority]!;
  const urgent = user.priority === "P0";

  return (
    <section
      aria-label="Recommended next action"
      className={`card flex flex-col gap-3 border-l-4 px-4 py-3 xl:flex-row xl:items-center xl:justify-between ${urgent ? "border-l-red-500 bg-red-50/70" : "border-l-amber-500 bg-amber-50/60"}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg ${urgent ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
          <TriangleAlert className="size-4" aria-hidden />
        </span>
        <span className={`inline-flex h-6 shrink-0 items-center rounded-md px-2.5 text-2xs font-semibold text-white ${urgent ? "bg-red-500" : "bg-amber-500"}`}>{copy.chip}</span>
        <div className="min-w-0">
          <p className={`text-xs font-bold tracking-wide ${urgent ? "text-red-600" : "text-amber-700"}`}>{copy.headline}</p>
          <p className="mt-0.5 text-2xs text-slate-700">
            <span className="font-semibold">Reason:</span> {user.priorityReason ?? "High product-qualified score."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-10 xl:pl-0">
        <Zap className={`size-4 ${urgent ? "text-amber-500" : "text-amber-600"}`} aria-hidden />
        <p className="text-2xs">
          <span className="block text-slate-500">Recommended action:</span>
          <span className={`font-semibold ${urgent ? "text-red-600" : "text-amber-700"}`}>
            {SLA_COPY[user.priority]}
            {user.nextBestAction ? ` · ${NEXT_ACTION_LABEL[user.nextBestAction] ?? user.nextBestAction}` : ""}
          </span>
        </p>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss recommendation" className="focus-ring rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}
