"use client";

import { useNow } from "@/components/ui/Now";
import { formatDuration } from "@/lib/revenue-center/format";

/** The only table cell subscribed to the 1-second clock, so rows stay memoized. */
export function SessionDuration({ startedAt, lastSeenAt, isOnline, className }: { startedAt: string | null; lastSeenAt: string | null; isOnline: boolean; className?: string }) {
  const now = useNow();
  if (!startedAt) return <span className="text-slate-400">—</span>;
  const end = isOnline ? now : lastSeenAt ? Date.parse(lastSeenAt) : now;
  const seconds = Math.max(0, Math.round((end - Date.parse(startedAt)) / 1000));
  return <span className={className ?? "tabular font-semibold text-gray-900"}>{formatDuration(seconds)}</span>;
}
