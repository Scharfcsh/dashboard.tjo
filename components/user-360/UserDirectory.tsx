"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Search, SearchX, TriangleAlert } from "lucide-react";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { CountryBadge } from "@/components/ui/CountryBadge";
import { useNow } from "@/components/ui/Now";
import { StatusDot } from "@/components/ui/StatusDot";
import { cx } from "@/components/ui/tones";
import { lifecycleLabel, relativeTime } from "@/lib/revenue-center/format";
import type { DirectoryData } from "@/lib/user-360/types";

/** Landing page for User 360: find the person, then open their profile. */
export function UserDirectory({ data }: { data: DirectoryData }) {
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow();
  const [text, setText] = useState(data.query);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);
  const demoReason = data.source.kind === "demo" ? data.source.reason : null;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (text.trim()) params.set("q", text.trim());
      startTransition(() => router.replace(`${pathname}${params.toString() ? `?${params}` : ""}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(t);
  }, [text, pathname, router]);

  return (
    <>
      <PageHeader title="User Intelligence" subtitle="Search any user and open their complete 360 profile.">
        <label className="relative">
          <span className="sr-only">Search by name, email, phone or User ID</span>
          <Search className={cx("pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2", pending ? "animate-pulse text-brand" : "text-slate-400")} aria-hidden />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search name, email, phone or User ID…"
            className="focus-ring h-9 w-72 rounded-lg border border-line bg-white pr-2.5 pl-8 text-xs text-slate-700 shadow-card placeholder:text-slate-400 hover:border-slate-300"
          />
        </label>
      </PageHeader>

      {demoReason && (
        <p role="note" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {demoReason}
        </p>
      )}

      <section aria-label="Users" className="card">
        <header className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
          <h2 className="text-sm font-semibold text-gray-900">
            Users <span className="font-normal text-slate-500">({data.total})</span>
          </h2>
          <span className="text-2xs text-slate-400">Ranked by routing priority, then PQL score</span>
        </header>
        <div className={cx("overflow-x-auto transition-opacity", pending && "opacity-60")}>
          <table className="w-full min-w-[52rem] border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-2xs text-slate-500">
                <th scope="col" className="px-4 py-2 font-medium">User</th>
                <th scope="col" className="px-2 py-2 font-medium">User ID</th>
                <th scope="col" className="px-2 py-2 font-medium">Country</th>
                <th scope="col" className="px-2 py-2 font-medium">Plan</th>
                <th scope="col" className="px-2 py-2 font-medium">Lifecycle</th>
                <th scope="col" className="px-2 py-2 font-medium">Auto Apply</th>
                <th scope="col" className="px-2 py-2 font-medium">PQL</th>
                <th scope="col" className="px-2 py-2 font-medium">Last Active</th>
                <th scope="col" className="px-2 py-2 font-medium">Owner</th>
                <th scope="col" className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80">
                  <td className="px-4 py-2">
                    <Link href={`/user-intelligence/${encodeURIComponent(r.userId)}`} className="focus-ring flex min-w-0 items-center gap-2 rounded">
                      <Avatar name={r.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-900">{r.name}</span>
                        <span className="block truncate text-2xs text-slate-500">{r.email ?? "—"}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="truncate px-2 py-2 font-mono text-2xs text-slate-500">{r.displayId}</td>
                  <td className="px-2 py-2">
                    <CountryBadge code={r.country} />
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone={r.isPaid ? "green" : "slate"} size="sm">
                      {r.isPaid ? r.plan : "Free"}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-slate-600">{lifecycleLabel(r.lifecycleStage)}</td>
                  <td className="tabular px-2 py-2 text-slate-600">
                    {r.autoApplyUsed}/{r.autoApplyLimit}
                  </td>
                  <td className="px-2 py-2">
                    <PQLScore score={r.pqlScore} size={28} />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={r.isOnline ? "green" : "slate"} pulse={r.isOnline} />
                      {r.isOnline ? "Active now" : relativeTime(r.lastActiveAt, now)}
                    </span>
                  </td>
                  <td className="truncate px-2 py-2 text-slate-600">{r.ownerName ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/user-intelligence/${encodeURIComponent(r.userId)}`} className="focus-ring inline-flex items-center gap-1 rounded text-2xs font-semibold text-brand hover:text-brand-strong">
                      Open 360 <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <SearchX className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-gray-900">No users match “{data.query}”</p>
              <p className="mt-1 text-xs text-slate-500">Search by name, email, phone or User ID.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
