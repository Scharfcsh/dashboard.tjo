"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Flame, Lightbulb, Mail, MessageCircle, Phone, ShoppingCart, Target } from "lucide-react";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useNow } from "@/components/ui/Now";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx, TONES } from "@/components/ui/tones";
import { relativeTime } from "@/lib/revenue-center/format";
import type { CallNextLead } from "@/lib/sales-crm/types";

// The one card that answers "who do I call next, and why". Everything a caller
// needs before dialling is here, so they never have to go hunting.

const PRIORITY_COPY: Record<string, { label: string; tone: "red" | "amber" | "slate" }> = {
  P0: { label: "P0 · Call Immediately", tone: "red" },
  P1: { label: "P1 · Call Today", tone: "amber" },
  P2: { label: "P2 · Nurture", tone: "slate" },
};

export function CallNextCard({
  lead,
  demo,
  busy,
  onContact,
}: {
  lead: CallNextLead;
  demo: boolean;
  busy: boolean;
  onContact: (type: "call" | "whatsapp" | "email") => void;
}) {
  const now = useNow();
  const priority = PRIORITY_COPY[lead.priority ?? "P2"] ?? PRIORITY_COPY.P2!;
  const tone = TONES[priority.tone];

  const action =
    "focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

  const contact = (type: "call" | "whatsapp" | "email", label: string, className: string, Icon: typeof Phone) => {
    const button = (
      <button
        type="button"
        onClick={() => onContact(type)}
        disabled={demo || busy}
        className={cx(action, "w-full", className)}
      >
        <Icon className="size-3.5" aria-hidden />
        {label}
      </button>
    );
    return demo ? (
      // Tooltip renders its own wrapper, so the flex sizing has to go on it.
      <Tooltip
        key={type}
        content="Contact actions are disabled — see the note at the top of the page."
        side="top"
        className="flex-1"
      >
        <span tabIndex={0} className="focus-ring flex w-full rounded-lg">
          {button}
        </span>
      </Tooltip>
    ) : (
      <span key={type} className="flex flex-1">
        {button}
      </span>
    );
  };

  const fact = (label: string, value: string, Icon: typeof Target, extra?: React.ReactNode) => (
    <div className="min-w-[7.5rem] flex-1 rounded-lg border border-line bg-white px-2.5 py-2">
      <span className="flex items-center gap-1.5 text-2xs text-slate-500">
        <Icon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular mt-0.5 block truncate text-sm font-bold text-gray-900">{value}</span>
      {extra}
    </div>
  );

  return (
    <section
      aria-labelledby="call-next-title"
      className={cx("card overflow-hidden border-2", priority.tone === "red" ? "border-red-200" : "border-line")}
    >
      <div className={cx("flex items-center justify-between gap-3 px-4 py-2", tone.soft)}>
        <h2 id="call-next-title" className={cx("flex items-center gap-2 text-sm font-bold tracking-wide uppercase", tone.text)}>
          <Target className="size-4" aria-hidden />
          Call Next
          <span className="hidden text-2xs font-medium normal-case opacity-80 sm:inline">
            — {lead.queuedBecause}
          </span>
        </h2>
        <Badge tone={priority.tone} className="shrink-0 font-semibold">
          {priority.label}
        </Badge>
      </div>

      <div className="px-4 py-3">
        <div className="grid grid-cols-1 gap-3 min-[100rem]:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={lead.name} size="lg" />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-gray-900">{lead.name}</h3>
                <span className="inline-flex items-center gap-1 text-2xs text-slate-500">
                  <StatusDot tone={lead.isOnline ? "green" : "slate"} pulse={lead.isOnline} />
                  {lead.isOnline ? "Active now" : `Active ${relativeTime(lead.lastActiveAt, now)}`}
                </span>
              </div>
              <p className="truncate font-mono text-2xs text-slate-500">{lead.userId}</p>
              <p className="mt-0.5 truncate text-2xs text-slate-600">
                {[lead.role, lead.city].filter(Boolean).join(" · ") || "Role unknown"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <PQLScore score={lead.pqlScore} size={56} showTotal />
            {fact("Auto Apply", `${lead.autoApplyUsed}/${lead.autoApplyLimit}`, Target,
              <>
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={cx("block h-full rounded-full", lead.freeApplicationsLeft === 0 ? "bg-red-500" : "bg-amber-500")}
                    style={{ width: `${Math.min(100, (lead.autoApplyUsed / lead.autoApplyLimit) * 100)}%` }}
                  />
                </span>
                <span className="mt-0.5 block text-[0.625rem] text-slate-500">
                  {lead.freeApplicationsLeft} free application{lead.freeApplicationsLeft === 1 ? "" : "s"} left
                </span>
              </>
            )}
            {fact("Pricing views", String(lead.pricingViews), Flame)}
            {fact("Plan interest", lead.planInterest ?? "None yet", Lightbulb)}
            {fact("Checkout", lead.checkoutLabel, ShoppingCart)}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="rounded-lg border border-red-100 bg-red-50/70 px-3 py-2">
            <span className="flex items-center gap-1.5 text-2xs font-semibold text-red-700">
              <Flame className="size-3" aria-hidden />
              Lead reason
            </span>
            <p className="mt-0.5 text-xs leading-5 font-medium text-gray-900">{lead.reason}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2">
            <span className="flex items-center gap-1.5 text-2xs font-semibold text-emerald-700">
              <Lightbulb className="size-3" aria-hidden />
              Recommended pitch
            </span>
            <p className="mt-0.5 text-xs leading-5 text-gray-800">{lead.pitch}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {contact("call", "Call Now", "bg-brand text-white hover:bg-brand-strong", Phone)}
          {contact("whatsapp", "WhatsApp", "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100", MessageCircle)}
          {contact("email", "Email", "border border-line bg-white text-slate-700 hover:bg-slate-50", Mail)}
          <Link
            href={`/user-intelligence/${encodeURIComponent(lead.userId)}`}
            className={cx(action, "flex-1 border border-line bg-white text-slate-700 hover:bg-slate-50")}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Open User 360
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
