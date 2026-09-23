"use client";

import { useNow } from "@/components/ui/Now";
import { StatusDot } from "@/components/ui/StatusDot";

export function LiveStatus({ isOnline, lastSeenAt }: { isOnline: boolean; lastSeenAt: string | null }) {
  const now = useNow();
  if (isOnline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-700">
        <StatusDot tone="green" pulse />
        Online
      </span>
    );
  }
  const minutes = lastSeenAt ? Math.max(1, Math.round((now - Date.parse(lastSeenAt)) / 60_000)) : null;
  const ago = minutes === null ? null : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`;
  return (
    <span className="inline-flex items-start gap-1.5 leading-4 text-slate-500">
      <StatusDot tone={minutes !== null && minutes < 60 ? "amber" : "slate"} className="mt-1" />
      <span className="min-w-0">
        {ago ? "Active" : "Offline"}
        {ago && <span className="block whitespace-nowrap">{ago}</span>}
      </span>
    </span>
  );
}
