"use client";

import { useEffect, useState, useTransition } from "react";
import { BellPlus, Clock, ExternalLink, FileText, Hash, Monitor, Play, UserPlus, X } from "lucide-react";
import { getLiveSessionAction } from "@/app/(dashboard)/live-users/actions";
import { RawEventsDialog } from "@/components/live-intelligence/RawEventsDialog";
import { SessionDuration } from "@/components/live-intelligence/SessionDuration";
import { SessionTimeline } from "@/components/live-intelligence/SessionTimeline";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import { countryName, flagEmoji } from "@/lib/revenue-center/format";
import { hasProductIssue, NEXT_ACTION_LABEL, pricingIntent, INTENT_META } from "@/lib/live-intelligence/derive";
import type { LiveSession, LiveUser } from "@/lib/live-intelligence/types";

type Loaded = { key: string; session: LiveSession | null; error: string | null };

export function LiveSessionPreview({
  user,
  demo,
  version,
  onOpen360,
  onAssign,
  onCreateAlert,
  onClose,
  className,
}: {
  user: LiveUser | null;
  demo: boolean;
  /** Changes when the dashboard data refreshes, so the timeline reloads too. */
  version: string;
  onOpen360: (u: LiveUser) => void;
  onAssign: (u: LiveUser) => void;
  onCreateAlert: (u: LiveUser) => void;
  onClose?: () => void;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [pending, startTransition] = useTransition();
  const key = user ? `${user.userId}|${version}` : "";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await getLiveSessionAction(user.userId, demo);
      if (cancelled) return;
      setLoaded(result.ok ? { key, session: result.data, error: null } : { key, session: null, error: result.error });
    });
    return () => {
      cancelled = true;
    };
    // `key` captures user + data version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, demo]);

  const current = loaded && loaded.key === key ? loaded : null;
  const session = current?.session ?? null;
  const loading = !current || pending;
  const intent = user ? pricingIntent(user) : "low";
  const highIntent = user && (user.priority === "P0" || user.priority === "P1" || INTENT_META[intent].rank >= 2);

  return (
    <aside aria-labelledby="session-preview-title" className={cx("card flex min-h-0 flex-col", className)}>
      <header className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h2 id="session-preview-title" className="text-sm font-semibold text-gray-900">
          Live Session Preview
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close session preview" className="focus-ring rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </header>

      {!user ? (
        <p className="px-4 pb-6 text-xs text-slate-500">Select a user to preview their live session.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size="lg" className="!size-11 !text-sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="truncate text-sm font-semibold text-gray-900">{user.name}</span>
                <span className={cx("inline-flex items-center gap-1 text-2xs", user.isOnline ? "text-emerald-600" : "text-slate-500")}>
                  <StatusDot tone={user.isOnline ? "green" : "slate"} pulse={user.isOnline} />
                  {user.isOnline ? "Active now" : "Away"}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-2xs text-slate-500">
                <span className="truncate font-mono" title={user.displayId}>
                  {user.displayId}
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span aria-hidden>{flagEmoji(user.country)}</span>
                  {countryName(user.country)}
                </span>
              </div>
            </div>
          </div>

          {highIntent && user.nextBestAction && (
            <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-2xs text-orange-800">
              Next best action: <span className="font-semibold">{NEXT_ACTION_LABEL[user.nextBestAction] ?? user.nextBestAction}</span>
            </p>
          )}
          {hasProductIssue(user) && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-2xs text-red-700">
              ⚠ {user.autoApplyFailures7d} Auto Apply failures in 7 days — investigate before selling.
            </p>
          )}

          <dl className="mt-3 grid grid-cols-3 gap-1 border-y border-slate-100 py-2.5">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0">
                <dd>
                  <SessionDuration startedAt={session?.startedAt ?? user.sessionStartedAt} lastSeenAt={user.lastSeenAt} isOnline={user.isOnline} className="tabular block text-xs font-semibold text-gray-900" />
                </dd>
                <dt className="text-[0.5625rem] text-slate-400">Session duration</dt>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Hash className="size-3.5 shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0">
                <dd className="text-xs font-semibold text-gray-900">{session?.sessionNumber ? `#${session.sessionNumber}` : "—"}</dd>
                <dt className="text-[0.5625rem] text-slate-400">Session number</dt>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Monitor className="size-3.5 shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0">
                <dd className="truncate text-xs font-semibold text-gray-900">{session?.browser?.split(" · ")[0] ?? "—"}</dd>
                <dt className="truncate text-[0.5625rem] text-slate-400">{session?.browser?.split(" · ")[1] ?? session?.device ?? "Device"}</dt>
              </div>
            </div>
          </dl>

          <h3 className="mt-3 mb-2 text-xs font-semibold text-gray-900">Session Timeline</h3>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1" aria-busy={loading}>
            {loading && !session ? (
              <div className="space-y-2.5">
                {Array.from({ length: 7 }, (_, i) => (
                  <Skeleton key={i} className="h-3.5 w-full" />
                ))}
              </div>
            ) : current?.error ? (
              <p className="text-xs text-red-600">{current.error}</p>
            ) : session ? (
              <SessionTimeline events={session.events.slice(-12)} />
            ) : (
              <p className="text-xs text-slate-500">No session has been recorded for this user yet.</p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpen360(user)}
              className="focus-ring col-span-2 inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg bg-brand px-1.5 text-2xs font-semibold whitespace-nowrap text-white hover:bg-brand-strong 2xl:col-span-1"
            >
              <span className="truncate">Open User 360</span> <ExternalLink className="size-3 shrink-0" aria-hidden />
            </button>
            <Tooltip content="Watch Session Replay — session replay isn't connected yet." className="w-full">
              <button type="button" disabled className="inline-flex h-8 w-full min-w-0 cursor-not-allowed items-center justify-center gap-1 rounded-lg border border-line px-1.5 text-2xs font-medium whitespace-nowrap text-slate-400">
                <Play className="size-3 shrink-0" aria-hidden /> <span className="truncate">Watch Replay</span>
              </button>
            </Tooltip>
            <button
              type="button"
              onClick={() => onAssign(user)}
              title="Assign to Sales"
              className="focus-ring inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg border border-line px-1.5 text-2xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
            >
              <UserPlus className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">Assign to Sales</span>
            </button>
            <Tooltip content={demo ? "Disabled while showing demo data" : "Raise a manual follow-up alert"} className="w-full">
              <button
                type="button"
                disabled={demo}
                onClick={() => onCreateAlert(user)}
                className="focus-ring inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-lg border border-line px-1.5 text-2xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <BellPlus className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">Create Alert</span>
              </button>
            </Tooltip>
            <button
              type="button"
              disabled={!session}
              onClick={() => setShowRaw(true)}
              className="focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dashed 2xl:col-span-2 border-line px-2 text-2xs font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <FileText className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">View Raw Events</span>
            </button>
          </div>
        </div>
      )}
      {showRaw && session && user && <RawEventsDialog session={session} name={user.name} onClose={() => setShowRaw(false)} />}
    </aside>
  );
}
