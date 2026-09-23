"use client";

import { useState, useTransition } from "react";
import { BadgeIndianRupee, CircleAlert, CircleCheck, ExternalLink, TriangleAlert } from "lucide-react";
import { loadMoreRawEventsAction } from "@/app/(dashboard)/user-intelligence/actions";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Badge } from "@/components/ui/Badge";
import { useNow } from "@/components/ui/Now";
import { cx } from "@/components/ui/tones";
import { formatCurrency, humanize, relativeTime } from "@/lib/revenue-center/format";
import type { ApplicationRow, RawEventRow, SalesActivityEntry, SupportSignals, UserProfileData } from "@/lib/user-360/types";

const OUTCOME: Record<ApplicationRow["outcome"], { label: string; tone: "green" | "red" | "amber" | "slate" | "blue" }> = {
  submitted: { label: "Submitted", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  blocked: { label: "Blocked by limit", tone: "amber" },
  in_progress: { label: "In progress", tone: "blue" },
  manual: { label: "Manual apply", tone: "slate" },
};

export function ApplicationsTable({ applications }: { applications: ApplicationRow[] }) {
  const now = useNow();
  return (
    <SectionCard title="Applications" info="Every Auto Apply run folded from its events, plus manual apply clicks." bodyClassName="px-0 pb-1">
      {applications.length === 0 ? (
        <p className="px-4 py-10 text-center text-xs text-slate-500">This user has not applied to any jobs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-2xs text-slate-500">
                <th scope="col" className="px-4 py-2 font-medium">Company</th>
                <th scope="col" className="px-2 py-2 font-medium">Role</th>
                <th scope="col" className="px-2 py-2 font-medium">Started</th>
                <th scope="col" className="px-2 py-2 font-medium">Outcome</th>
                <th scope="col" className="px-2 py-2 font-medium">Detail</th>
                <th scope="col" className="px-2 py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                  <td className="truncate px-4 py-2 font-medium text-gray-900">{a.company ?? "Unknown company"}</td>
                  <td className="truncate px-2 py-2 text-slate-600">{a.title ?? "—"}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-slate-600">{relativeTime(a.startedAt, now)}</td>
                  <td className="px-2 py-2">
                    <Badge tone={OUTCOME[a.outcome].tone} size="sm">
                      {OUTCOME[a.outcome].label}
                    </Badge>
                  </td>
                  <td className="max-w-72 truncate px-2 py-2 text-slate-500" title={a.reason ?? a.platform ?? undefined}>
                    {a.reason ?? a.platform ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    {a.jobUrl ? (
                      <a href={a.jobUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1 rounded text-brand hover:text-brand-strong">
                        Job <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export function SalesActivityTab({ activities, onAddNote, demo }: { activities: SalesActivityEntry[]; onAddNote: () => void; demo: boolean }) {
  const now = useNow();
  return (
    <SectionCard
      title="Sales Activity"
      info="Calls, WhatsApps, emails, notes and dispositions. Append-only history."
      actions={
        <button type="button" onClick={onAddNote} disabled={demo} className="focus-ring inline-flex h-7 items-center rounded-lg bg-brand px-2.5 text-2xs font-semibold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50">
          Add Note
        </button>
      }
    >
      {activities.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-500">No sales activity logged for this user yet.</p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[3px] before:w-px before:bg-slate-200">
          {activities.map((a) => (
            <li key={a.id} className="relative flex gap-3 pl-4">
              <span className="absolute top-1.5 left-0 size-[7px] rounded-full bg-teal-500 ring-2 ring-white" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-900">{a.summary}</p>
                <p className="text-2xs text-slate-500">
                  {humanize(a.type)}
                  {a.actorName ? ` · by ${a.actorName}` : ""}
                </p>
              </div>
              <time dateTime={a.at} className="shrink-0 text-2xs text-slate-400">
                {relativeTime(a.at, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

export function SubscriptionTab({ intent }: { intent: UserProfileData["intent"] }) {
  const now = useNow();
  const { payments, subscriptions } = intent;
  return (
    <SectionCard title="Subscription & Payments" info="Plan history and every payment attempt recorded for this user." bodyClassName="pt-1">
      <dl className="grid grid-cols-2 gap-2 text-2xs sm:grid-cols-4">
        {[
          ["Successful payments", String(payments.successful)],
          ["Failed payments", String(payments.failed)],
          ["Lifetime revenue", formatCurrency(payments.lifetimeRevenue)],
          ["First pricing visit", intent.firstPricingViewAt ? relativeTime(intent.firstPricingViewAt, now) : "Never"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className="tabular text-sm font-semibold text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-3 mb-1.5 text-xs font-semibold text-gray-900">Subscriptions</h3>
      {subscriptions.length === 0 ? (
        <p className="text-2xs text-slate-500">No subscription has been created for this user.</p>
      ) : (
        <ul className="space-y-1.5">
          {subscriptions.map((s) => (
            <li key={s.subscription_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-2xs">
              <span className="flex items-center gap-2">
                <BadgeIndianRupee className="size-3.5 text-slate-400" aria-hidden />
                <span className="font-semibold text-gray-900">{s.plan ?? "Plan"}</span>
                <Badge tone={s.status === "active" ? "green" : s.status === "created" ? "amber" : "slate"} size="sm">
                  {humanize(s.status)}
                </Badge>
              </span>
              <span className="text-slate-500">
                {s.amount === null ? "—" : formatCurrency(s.amount)} · {s.started_at ? relativeTime(s.started_at, now) : "not started"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function SupportTab({ support }: { support: SupportSignals }) {
  const now = useNow();
  const stats: [string, number, boolean][] = [
    ["Auto Apply failures (lifetime)", support.autoApplyFailuresLifetime, support.autoApplyFailuresLifetime > 0],
    ["Auto Apply failures (7 days)", support.autoApplyFailures7d, support.autoApplyFailures7d >= 3],
    ["Payment failures", support.paymentFailures, support.paymentFailures > 0],
    ["Errors seen (7 days)", support.errors7d, support.errors7d > 0],
    ["Blocked by free limit", support.blocked, false],
  ];
  return (
    <SectionCard
      title="Support & Product Issues"
      info="Friction this user hit. Repeated failures are a product problem, not a sales objection."
      actions={
        <Badge tone={support.status === "Healthy" ? "green" : "red"}>
          {support.status}
        </Badge>
      }
      bodyClassName="pt-1"
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map(([label, value, bad]) => (
          <div key={label} className={cx("rounded-lg border px-3 py-2", bad ? "border-red-100 bg-red-50/60" : "border-slate-100 bg-slate-50/60")}>
            <dt className="text-2xs text-slate-500">{label}</dt>
            <dd className={cx("tabular text-base font-semibold", bad ? "text-red-600" : "text-gray-900")}>{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-3 mb-1.5 text-xs font-semibold text-gray-900">Open alerts</h3>
      {support.openAlerts.length === 0 ? (
        <p className="flex items-center gap-1.5 text-2xs text-slate-500">
          <CircleCheck className="size-3.5 text-emerald-500" aria-hidden /> No open alerts for this user.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {support.openAlerts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-2xs">
              <span className="flex min-w-0 items-center gap-2">
                <TriangleAlert className="size-3.5 shrink-0 text-red-500" aria-hidden />
                <span className="truncate text-gray-900">{a.title}</span>
                <Badge tone={a.priority === "P0" ? "red" : "amber"} size="sm">
                  {a.priority}
                </Badge>
              </span>
              <time dateTime={a.created_at} className="shrink-0 text-slate-400">
                {relativeTime(a.created_at, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-2xs text-slate-400">
        <CircleAlert className="size-3.5" aria-hidden /> Support ticketing is not connected to this workspace yet.
      </p>
    </SectionCard>
  );
}

export function RawEventsTab({ userId, initial, demo }: { userId: string; initial: UserProfileData["rawEvents"]; demo: boolean }) {
  const [rows, setRows] = useState<RawEventRow[]>(initial.rows);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, startTransition] = useTransition();

  const more = () => {
    if (!cursor) return;
    startTransition(async () => {
      const result = await loadMoreRawEventsAction(userId, cursor, demo);
      if (result.ok) {
        setRows((prev) => [...prev, ...result.data.rows]);
        setCursor(result.data.nextCursor);
      }
    });
  };

  return (
    <SectionCard title="Raw Events" info="The engineer-facing view: every event exactly as ingested." bodyClassName="px-0 pb-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-xs">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-2xs text-slate-500">
              <th scope="col" className="px-4 py-2 font-medium">Event</th>
              <th scope="col" className="px-2 py-2 font-medium">When</th>
              <th scope="col" className="px-2 py-2 font-medium">Page</th>
              <th scope="col" className="px-2 py-2 font-medium">Source</th>
              <th scope="col" className="px-2 py-2 font-medium">Properties</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-b-0 align-top hover:bg-slate-50/70">
                <td className="px-4 py-2">
                  <span className="block font-mono text-2xs text-gray-900">{e.name}</span>
                  <span className="block text-2xs text-slate-500">{e.label}</span>
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-slate-600">{new Date(e.at).toLocaleString("en-IN")}</td>
                <td className="truncate px-2 py-2 text-slate-500">{e.page ?? "—"}</td>
                <td className="px-2 py-2 text-slate-500">{e.source}</td>
                <td className="px-2 py-2">
                  {Object.keys(e.properties).length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-2xs text-slate-500 hover:text-gray-900">{Object.keys(e.properties).length} fields</summary>
                      <pre className="mt-1 max-w-80 overflow-x-auto rounded-md bg-slate-50 p-2 text-[0.625rem] text-slate-700">{JSON.stringify(e.properties, null, 2)}</pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-500">
                  No events recorded for this user.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {cursor && (
        <div className="px-4 pt-3">
          <button type="button" onClick={more} disabled={pending} className="focus-ring inline-flex h-8 items-center rounded-lg border border-line px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {pending ? "Loading…" : "Load more events"}
          </button>
        </div>
      )}
    </SectionCard>
  );
}
