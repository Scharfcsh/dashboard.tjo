"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Flame, Lightbulb, Phone, Plus } from "lucide-react";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useNow } from "@/components/ui/Now";
import { StatusDot } from "@/components/ui/StatusDot";
import { cx } from "@/components/ui/tones";
import { formatEventTime, formatShortDate, relativeTime } from "@/lib/revenue-center/format";
import type { LeadDetail } from "@/lib/sales-crm/types";
import type { Tone } from "@/lib/revenue-center/types";

// The persistent rail: everything a caller needs to say something specific,
// without leaving the queue. Contact details stay masked here - the Call button
// is the single audited moment they are released.

const TABS = ["Overview", "Activity", "Calls", "Notes"] as const;
type Tab = (typeof TABS)[number];

const PRIORITY_TONE: Record<string, Tone> = { P0: "red", P1: "amber", P2: "slate" };

export function LeadDetailRail({
  lead,
  demo,
  busy,
  onCall,
  onAddNote,
}: {
  lead: LeadDetail | null;
  demo: boolean;
  busy: boolean;
  onCall: () => void;
  onAddNote: (body: string) => void;
}) {
  const now = useNow();
  const [tab, setTab] = useState<Tab>("Overview");
  const [note, setNote] = useState("");

  if (!lead) {
    return (
      <aside className="card flex min-h-[20rem] flex-col items-center justify-center px-4 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-slate-100">
          <Phone className="size-4 text-slate-400" aria-hidden />
        </span>
        <p className="mt-2 text-sm font-semibold text-gray-900">No lead selected</p>
        <p className="mt-1 text-xs text-slate-500">Pick a lead from your queue to see their full context.</p>
      </aside>
    );
  }

  const calls = lead.activities.filter((a) => a.type === "call");

  return (
    <aside aria-label={`Lead details for ${lead.name}`} className="card flex min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="truncate text-sm font-semibold text-gray-900">Lead Details</h2>
        <Link
          href={`/user-intelligence/${encodeURIComponent(lead.userId)}`}
          className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-2xs font-medium text-brand hover:text-brand-strong"
        >
          User 360 <ExternalLink className="size-3" aria-hidden />
        </Link>
      </div>

      <div className="flex items-start gap-2.5 px-4 pt-3">
        <Avatar name={lead.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-gray-900">{lead.name}</h3>
            {lead.priority && (
              <Badge tone={PRIORITY_TONE[lead.priority] ?? "slate"} size="sm" className="font-semibold">
                {lead.priority}
              </Badge>
            )}
          </div>
          <p className="truncate font-mono text-2xs text-slate-500">{lead.userId}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-slate-500">
            <StatusDot tone={lead.isOnline ? "green" : "slate"} pulse={lead.isOnline} />
            {lead.isOnline ? "Active now" : `Active ${relativeTime(lead.lastActiveAt, now)}`}
          </p>
        </div>
        <PQLScore score={lead.pqlScore} size={38} />
      </div>

      <nav className="mt-3 flex gap-1 overflow-x-auto border-b border-line px-3" aria-label="Lead detail sections">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              "focus-ring -mb-px shrink-0 rounded-t-md border-b-2 px-2.5 py-1.5 text-2xs font-medium transition-colors",
              tab === t ? "border-brand text-brand-strong" : "border-transparent text-slate-500 hover:text-gray-900"
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {tab === "Overview" && (
          <>
            <Section title="User Snapshot">
              <Row label="Role" value={lead.role ?? "—"} />
              <Row label="Location" value={lead.location ?? "—"} />
              <Row label="Email" value={lead.emailMasked ?? "—"} mono />
              <Row label="Phone" value={lead.phoneMasked ?? "—"} mono />
              <Row label="Joined" value={lead.joinedAt ? formatShortDate(lead.joinedAt.slice(0, 10)) : "—"} />
              <Row label="Status" value={lead.statusLabel} />
            </Section>

            <Section title="Why This Lead Is Hot" icon={<Flame className="size-3 text-red-500" aria-hidden />}>
              {lead.whyHot.length === 0 ? (
                <p className="text-2xs text-slate-500">No scoring reasons recorded yet.</p>
              ) : (
                <ul className="space-y-1">
                  {lead.whyHot.map((w) => (
                    <li key={w} className="flex gap-1.5 text-2xs text-slate-700">
                      <span className="mt-1 size-1 shrink-0 rounded-full bg-red-400" aria-hidden />
                      <span className="min-w-0">{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Product Usage">
              {lead.usage.map((u) => (
                <div key={u.label}>
                  <Row label={u.label} value={u.value} />
                  {u.bar && (
                    <span className="mt-0.5 mb-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={cx("block h-full rounded-full", u.bar.used >= u.bar.limit ? "bg-red-500" : "bg-amber-500")}
                        style={{ width: `${Math.min(100, (u.bar.used / u.bar.limit) * 100)}%` }}
                      />
                    </span>
                  )}
                </div>
              ))}
            </Section>

            <Section title="Pricing History">
              {lead.pricing.map((p) => (
                <Row key={p.label} label={p.label} value={p.value} />
              ))}
            </Section>

            <Section title="Recent Sessions">
              {lead.sessions.length === 0 ? (
                <p className="text-2xs text-slate-500">No sessions recorded.</p>
              ) : (
                <ul className="space-y-1.5">
                  {lead.sessions.map((s) => (
                    <li key={s.id} className="text-2xs">
                      <span className="block font-medium text-gray-800">{formatEventTime(s.startedAt, now)}</span>
                      <span className="block text-slate-500">{s.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2">
              <span className="flex items-center gap-1.5 text-2xs font-semibold text-emerald-700">
                <Lightbulb className="size-3" aria-hidden />
                Recommended pitch
              </span>
              <p className="mt-0.5 text-2xs leading-4 text-gray-800">{lead.pitch}</p>
            </div>
          </>
        )}

        {tab === "Activity" && <ActivityList items={lead.activities} now={now} empty="No contact has been logged yet." />}
        {tab === "Calls" && <ActivityList items={calls} now={now} empty="No calls have been logged yet." />}

        {tab === "Notes" && (
          <>
            <div>
              <label className="block text-2xs font-medium text-slate-600">
                Add a note
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={10_000}
                  disabled={demo || busy}
                  placeholder="What should the next caller know?"
                  className="focus-ring mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-card disabled:bg-slate-50"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  onAddNote(note);
                  setNote("");
                }}
                disabled={demo || busy || note.trim().length === 0}
                className="focus-ring mt-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="size-3.5" aria-hidden />
                Save note
              </button>
            </div>
            <ActivityList items={lead.notes} now={now} empty="No notes yet." />
          </>
        )}
      </div>

      <div className="border-t border-line px-4 py-2.5">
        <p className="text-2xs text-slate-500">Next action</p>
        <p className="truncate text-xs font-medium text-gray-900" title={lead.nextActionLabel}>
          {lead.nextActionLabel}
        </p>
        <button
          type="button"
          onClick={onCall}
          disabled={demo || busy}
          className="focus-ring mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand text-xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Phone className="size-3.5" aria-hidden />
          Call {lead.name.split(" ")[0]} now
        </button>
      </div>
    </aside>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-2xs font-semibold tracking-wide text-slate-500 uppercase">
        {icon}
        {title}
      </h4>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="shrink-0 text-2xs text-slate-500">{label}</span>
      <span className={cx("min-w-0 truncate text-2xs font-medium text-gray-800", mono && "font-mono")} title={value}>
        {value}
      </span>
    </div>
  );
}

function ActivityList({
  items,
  now,
  empty,
}: {
  items: LeadDetail["activities"];
  now: number;
  empty: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-2xs text-slate-500">{empty}</p>;
  return (
    <ol className="space-y-2.5">
      {items.map((a) => (
        <li key={a.id} className="rounded-lg border border-line px-2.5 py-1.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-2xs font-semibold text-gray-900">{a.summary}</span>
            <span className="shrink-0 text-[0.625rem] text-slate-400">{formatEventTime(a.at, now)}</span>
          </span>
          {a.detail && <p className="mt-0.5 text-2xs leading-4 text-slate-600">{a.detail}</p>}
          <span className="mt-0.5 block text-[0.625rem] text-slate-400">
            {a.actorName}
            {a.durationSeconds !== null && ` · ${Math.floor(a.durationSeconds / 60)}m ${a.durationSeconds % 60}s`}
          </span>
        </li>
      ))}
    </ol>
  );
}
