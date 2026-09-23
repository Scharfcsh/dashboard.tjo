"use client";

import { useState } from "react";
import { ChevronDown, FileText, Play } from "lucide-react";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx, TONES } from "@/components/ui/tones";
import { formatDuration } from "@/lib/revenue-center/format";
import type { SessionCard } from "@/lib/user-360/types";

const dayLabel = (iso: string, nowMs: number) => {
  const d = new Date(iso);
  const days = Math.floor((new Date(nowMs).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

/** Sessions as collapsible journeys, not one endless log. */
export function SessionJourney({ sessions, nowMs, onViewRaw }: { sessions: SessionCard[]; nowMs: number; onViewRaw: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => (sessions[0] ? { [sessions[0].sessionId]: true } : {}));
  const allOpen = sessions.length > 0 && sessions.every((s) => open[s.sessionId]);

  return (
    <SectionCard
      title="Session Timeline"
      info="Each visit grouped as one journey. 30 idle minutes starts a new session."
      actions={
        <>
          <button
            type="button"
            onClick={() => setOpen(allOpen ? {} : Object.fromEntries(sessions.map((s) => [s.sessionId, true])))}
            aria-label={allOpen ? "Collapse all sessions" : "Expand all sessions"}
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-2xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <ChevronDown className={cx("size-3 transition-transform", allOpen && "rotate-180")} aria-hidden />
            <span className="hidden 2xl:inline">{allOpen ? "Collapse All" : "Expand All"}</span>
          </button>
          <Tooltip content="Session replay isn't connected yet." align="end">
            <button type="button" disabled className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-lg border border-line px-2 text-2xs font-medium text-slate-400">
              <Play className="size-3" aria-hidden /> <span className="hidden 2xl:inline">Watch Session Replay</span>
            </button>
          </Tooltip>
          <button type="button" onClick={onViewRaw} aria-label="View raw events" className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-2xs font-medium text-slate-600 hover:bg-slate-50">
            <FileText className="size-3" aria-hidden /> <span className="hidden 2xl:inline">View Raw Events</span>
          </button>
        </>
      }
      bodyClassName="pt-1 space-y-2"
    >
      {sessions.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No sessions have been built for this user yet.</p>}
      {sessions.map((session, index) => {
        const isOpen = Boolean(open[session.sessionId]);
        return (
          <div key={session.sessionId} className="rounded-lg border border-slate-200">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((prev) => ({ ...prev, [session.sessionId]: !prev[session.sessionId] }))}
              className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={cx("size-2 shrink-0 rounded-full", session.isCurrent ? "bg-teal-500" : "bg-slate-300")} aria-hidden />
                <span className="truncate text-xs font-semibold text-gray-900">
                  Session {index + 1} – {dayLabel(session.startedAt, nowMs)}
                </span>
                {session.isCurrent && (
                  <Badge tone="teal" size="sm">
                    Current Session
                  </Badge>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-2xs text-slate-500">
                Duration: <span className="font-semibold text-gray-800">{formatDuration(session.durationSeconds)}</span>
                <ChevronDown className={cx("size-3.5 transition-transform", isOpen && "rotate-180")} aria-hidden />
              </span>
            </button>
            {isOpen && (
              <ol className="relative space-y-1 border-t border-slate-100 px-3 py-2 before:absolute before:top-3 before:bottom-3 before:left-[1.1875rem] before:w-px before:bg-slate-200">
                {session.events.map((e) => (
                  <li key={e.id} className="relative grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-2 pl-4">
                    <span className={cx("absolute top-1/2 left-0 size-[7px] -translate-y-1/2 rounded-full ring-2 ring-white", TONES[e.tone].dot)} aria-hidden />
                    <time dateTime={e.at} className="tabular text-[0.625rem] text-slate-400">
                      {clock(e.at)}
                    </time>
                    <span className={cx("min-w-0 truncate text-2xs", e.monetization ? "font-semibold text-amber-700" : "text-gray-800")} title={e.label}>
                      {e.label}
                      {e.outcome === "success" && <span className="ml-1.5 text-[0.5625rem] font-medium text-emerald-600">✓ Success</span>}
                      {e.outcome === "failed" && <span className="ml-1.5 text-[0.5625rem] font-medium text-red-600">× Failed</span>}
                    </span>
                    <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[0.5625rem] font-medium", TONES[e.tone].soft, TONES[e.tone].softText)}>{e.category}</span>
                  </li>
                ))}
                {session.events.length === 0 && <li className="py-2 text-2xs text-slate-500">No events recorded in this session.</li>}
              </ol>
            )}
          </div>
        );
      })}
    </SectionCard>
  );
}
