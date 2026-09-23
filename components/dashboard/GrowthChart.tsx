"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { FilterSelect } from "@/components/layout/FilterSelect";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { cx } from "@/components/ui/tones";
import { CHART_LABELS } from "@/lib/revenue-center/filters";
import { formatNumber, formatShortDate } from "@/lib/revenue-center/format";
import type { ChartDays, GrowthPoint } from "@/lib/revenue-center/types";

const SERIES = [
  { key: "active", label: "Active Users", color: "#0d9488" },
  { key: "pqls", label: "PQL Leads", color: "#8b5cf6" },
  { key: "paid", label: "Paid Users", color: "#3b82f6" },
] as const;

interface TooltipPayload {
  dataKey?: string | number;
  value?: number;
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const byKey = new Map(payload.map((p) => [String(p.dataKey), p.value ?? 0]));
  const activeUsers = byKey.get("active") ?? 0;
  return (
    <div className="min-w-44 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop">
      <div className="mb-1.5 font-semibold text-gray-900">{formatShortDate(label)}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
          <span className="tabular font-semibold text-gray-900">{formatNumber(byKey.get(s.key) ?? 0)}</span>
        </div>
      ))}
      {activeUsers > 0 && (
        <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-2xs text-slate-500">
          {Math.round(((byKey.get("pqls") ?? 0) / activeUsers) * 100)}% of active users are PQLs
        </div>
      )}
    </div>
  );
}

export function GrowthChart({ data, days }: { data: GrowthPoint[]; days: ChartDays }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setDays = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "30") params.delete("chart");
    else params.set("chart", value);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const summary = data.length
    ? `Over ${data.length} days, active users went from ${data[0]!.active} to ${data[data.length - 1]!.active}, PQLs from ${data[0]!.pqls} to ${data[data.length - 1]!.pqls}, and paid users from ${data[0]!.paid} to ${data[data.length - 1]!.paid}.`
    : "No data.";

  return (
    <SectionCard
      title="Active Users vs Product Qualified Leads vs Paid Users"
      info="Daily active users, users with a PQL score of 75+ as of each day, and users holding an active subscription."
      actions={
        <FilterSelect
          label="Chart period"
          value={String(days)}
          onChange={setDays}
          options={Object.entries(CHART_LABELS).map(([value, label]) => ({ value, label }))}
          className="w-32"
        />
      }
      bodyClassName={cx("pt-0 transition-opacity", pending && "opacity-60")}
    >
      <ul className="mb-1 flex justify-end gap-4 text-2xs text-slate-600" aria-hidden>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <p className="sr-only">{summary}</p>
      <div className="h-52 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="activeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#0d9488" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#eef2f6" />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 10.5, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              minTickGap={36}
              tickMargin={8}
            />
            <YAxis tick={{ fontSize: 10.5, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} width={48} />
            <ChartTooltip content={<ChartTip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }} />
            <Area type="monotone" dataKey="active" stroke="#0d9488" strokeWidth={2} fill="url(#activeFill)" dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="pqls" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="paid" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}
