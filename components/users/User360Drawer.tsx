"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Flame, Mail, MessageCircle, Phone, UserPlus, X } from "lucide-react";
import { assignOwnerAction, getUser360Action, logContactAction } from "@/app/(dashboard)/overview/actions";
import { UserActivityTimeline } from "@/components/users/UserActivityTimeline";
import { UserProfile } from "@/components/users/UserProfile";
import { Badge } from "@/components/ui/Badge";
import { useNow } from "@/components/ui/Now";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import { formatDuration, formatNumber, formatClock, humanize, relativeTime } from "@/lib/revenue-center/format";
import type { User360View } from "@/lib/revenue-center/types";

export type DrawerIntent = "profile" | "call" | "whatsapp" | "email" | "assign" | "follow_up" | "recover";

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border-t border-slate-100 px-5 py-4">
      <h3 className="mb-2.5 text-2xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
      <div className="text-2xs text-slate-500">{label}</div>
      <div className={cx("tabular text-sm font-semibold text-gray-900", tone)}>{value}</div>
    </div>
  );
}

const PRIORITY_STYLE = {
  P0: "border-red-200 bg-red-50 text-red-700",
  P1: "border-amber-200 bg-amber-50 text-amber-800",
  P2: "border-blue-200 bg-blue-50 text-blue-700",
} as const;

export function User360Drawer({
  userId,
  intent,
  demo,
  onClose,
}: {
  userId: string | null;
  intent: DrawerIntent;
  demo: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const now = useNow();
  const [view, setView] = useState<User360View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [owner, setOwner] = useState("");
  const [loading, startLoading] = useTransition();
  const [mutating, startMutating] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  // Parent passes a fresh onClose each render; keep the latest without re-running effects.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!userId) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    startLoading(async () => {
      const result = await getUser360Action(userId, demo);
      if (result.ok) {
        setView(result.data);
        setOwner(result.data.sales.ownerId ?? "");
      } else setError(result.error);
    });
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userId, demo]);

  // The drawer is keyed by user, so it unmounts on close: restore focus to the trigger.
  useEffect(() => () => returnFocus.current?.focus(), []);

  useEffect(() => {
    if (!view || intent === "profile") return;
    const target = intent === "assign" || intent === "call" || intent === "whatsapp" || intent === "email" ? "user360-sales" : "user360-intent";
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view, intent]);

  if (!userId) return null;

  const disabledReason = demo ? "Disabled while showing demo data" : !view?.sales.leadId ? "No open lead yet — assign an owner first" : null;

  const logContact = (type: "call" | "whatsapp" | "email") => {
    if (!view?.sales.leadId) return;
    startMutating(async () => {
      const result = await logContactAction(view.sales.leadId!, type, demo);
      if (result.ok) {
        setNotice({ tone: "ok", text: `${humanize(type)} logged at ${formatClock(result.data.at)}.` });
        const refreshed = await getUser360Action(view.userId, demo);
        if (refreshed.ok) setView(refreshed.data);
        router.refresh();
      } else setNotice({ tone: "error", text: result.error });
    });
  };

  const assign = () => {
    if (!view || !owner) return;
    startMutating(async () => {
      const result = await assignOwnerAction(view.userId, owner, demo);
      if (result.ok) {
        setNotice({ tone: "ok", text: `Assigned to ${result.data.ownerName ?? "owner"}.` });
        const refreshed = await getUser360Action(view.userId, demo);
        if (refreshed.ok) setView(refreshed.data);
        router.refresh();
      } else setNotice({ tone: "error", text: result.error });
    });
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="user360-title">
      <button type="button" aria-label="Close User 360" tabIndex={-1} onClick={onClose} className="absolute inset-0 animate-fade-in cursor-default bg-gray-900/20" />
      <div className="absolute inset-y-0 right-0 flex w-full animate-drawer-in flex-col bg-white shadow-pop sm:w-[30rem] sm:border-l sm:border-line">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-xs font-semibold text-slate-500">User 360 Intelligence</span>
          <div className="flex items-center gap-2">
            <Link
              href={`/user-intelligence/${encodeURIComponent(userId)}`}
              className="focus-ring inline-flex items-center gap-1 rounded text-2xs font-medium text-brand hover:text-brand-strong"
            >
              Open full profile <ExternalLink className="size-3" aria-hidden />
            </Link>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="focus-ring rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-gray-900">
            <X className="size-4" aria-hidden />
          </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" aria-busy={loading}>
          {error && <p className="m-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {!view && !error && (
            <div className="space-y-4 p-5">
              <div className="flex gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-16 w-full" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {view && (
            <>
              <div className="px-5 py-4">
                <UserProfile user={view} now={now} />
              </div>

              {view.pql && (
                <div id="user360-intent" className="scroll-mt-2 px-5 pb-4">
                  <div className={cx("rounded-lg border px-3 py-2.5", view.pql.priority ? PRIORITY_STYLE[view.pql.priority] : "border-slate-200 bg-slate-50 text-slate-700")}>
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Flame className="size-3.5" aria-hidden />
                      {view.pql.priority ? `${view.pql.priority} · ` : ""}
                      {view.pql.reason ?? "No routing priority"}
                    </div>
                    <p className="mt-0.5 text-2xs opacity-90">
                      Recommended action: <span className="font-semibold">{humanize(view.pql.nextBestAction)}</span>
                    </p>
                  </div>
                </div>
              )}

              {notice && (
                <p role="status" className={cx("mx-5 mb-3 rounded-lg px-3 py-2 text-xs", notice.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                  {notice.text}
                </p>
              )}

              <Section title="Revenue intent">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Auto Apply" value={`${view.autoApply.used}/${view.autoApply.limit}`} tone={view.autoApply.used >= view.autoApply.limit ? "text-red-600" : undefined} />
                  <Stat label="Pricing views" value={formatNumber(view.intent.pricingViews)} />
                  <Stat label="Checkouts" value={`${view.intent.checkoutsStarted}${view.intent.checkoutsAbandoned ? ` · ${view.intent.checkoutsAbandoned} abandoned` : ""}`} />
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-2xs text-slate-500">
                    <span>Free Auto Apply allowance</span>
                    <span className="tabular">
                      {view.autoApply.successful} successful · {view.autoApply.failed} failed
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={view.autoApply.used} aria-valuemin={0} aria-valuemax={view.autoApply.limit} aria-label="Free Auto Apply usage">
                    <div
                      className={cx("h-full rounded-full", view.autoApply.used >= view.autoApply.limit ? "bg-red-500" : view.autoApply.used >= 40 ? "bg-amber-500" : "bg-brand")}
                      style={{ width: `${Math.min(100, (view.autoApply.used / Math.max(1, view.autoApply.limit)) * 100)}%` }}
                    />
                  </div>
                </div>
                {view.pql && view.pql.reasons.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {view.pql.reasons.slice(0, 6).map((r) => (
                      <li key={r.label} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{r.label}</span>
                        <span className={cx("tabular font-semibold", r.points >= 0 ? "text-emerald-600" : "text-red-500")}>
                          {r.points >= 0 ? "+" : ""}
                          {r.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title={view.session?.isCurrent ? "Current session" : "Most recent session"}>
                {view.session && (
                  <p className="mb-3 text-xs text-slate-600">
                    Started {formatClock(view.session.startedAt)} · {formatDuration(view.session.durationSeconds)}
                    {view.session.device ? ` · ${view.session.device}` : ""}
                  </p>
                )}
                <UserActivityTimeline events={view.activity} now={now} />
              </Section>

              <Section title="Sales engagement" id="user360-sales">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Owner</span>
                  <span className="font-medium text-gray-900">{view.sales.ownerName ?? "Unassigned"}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Lead status</span>
                  {view.sales.leadStatus ? <Badge size="sm">{humanize(view.sales.leadStatus)}</Badge> : <span className="text-slate-400">No open lead</span>}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Last contact</span>
                  <span className="text-gray-900">{view.sales.lastContactAt ? relativeTime(view.sales.lastContactAt, now) : "Never"}</span>
                </div>

                <div className="mt-3 flex gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Assign owner</span>
                    <select
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      disabled={demo || mutating}
                      className="focus-ring h-8 w-full rounded-lg border border-line bg-white px-2 text-xs text-slate-700 disabled:opacity-60"
                    >
                      <option value="">Select owner…</option>
                      {view.team.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Tooltip content={demo ? "Disabled while showing demo data" : "Assign this user to a sales owner"} align="end">
                    <button
                      type="button"
                      onClick={assign}
                      disabled={demo || mutating || !owner || owner === view.sales.ownerId}
                      className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UserPlus className="size-3.5" aria-hidden /> Assign
                    </button>
                  </Tooltip>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["call", "Log call", Phone],
                      ["whatsapp", "WhatsApp", MessageCircle],
                      ["email", "Email", Mail],
                    ] as const
                  ).map(([type, label, IconCmp]) => (
                    <Tooltip key={type} content={disabledReason ?? `Record a ${label.toLowerCase()} for this lead`} className="w-full">
                      <button
                        type="button"
                        onClick={() => logContact(type)}
                        disabled={Boolean(disabledReason) || mutating}
                        className={cx(
                          "focus-ring inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          intent === type ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-white text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        <IconCmp className="size-3.5" aria-hidden /> {label}
                      </button>
                    </Tooltip>
                  ))}
                </div>

                <h4 className="mt-4 mb-2 text-2xs font-semibold text-slate-500">Contact history</h4>
                {view.sales.contacts.length === 0 ? (
                  <p className="text-xs text-slate-500">No calls, messages or notes yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {view.sales.contacts.map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-3 text-xs">
                        <span className="min-w-0 text-gray-800">
                          {c.summary}
                          {c.actorName && <span className="block text-2xs text-slate-500">by {c.actorName}</span>}
                        </span>
                        <time dateTime={c.at} className="shrink-0 text-2xs text-slate-400">
                          {relativeTime(c.at, now)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
