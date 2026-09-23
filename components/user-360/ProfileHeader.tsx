"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, CalendarDays, ChevronDown, Flame, Mail, MapPin, MessageCircle, NotebookPen, Phone, UserPlus, type LucideIcon } from "lucide-react";
import { revealContactAction } from "@/app/(dashboard)/user-intelligence/actions";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/tones";
import { countryName, flagEmoji, lifecycleLabel } from "@/lib/revenue-center/format";
import type { ProfileUser } from "@/lib/user-360/types";

const dateFmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function ActionButton({ label, icon: Icon, onClick, variant = "outline", disabled, title }: { label: string; icon: LucideIcon; onClick?: () => void; variant?: "outline" | "green"; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cx(
        "focus-ring inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-2xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 2xl:text-xs",
        variant === "green" ? "bg-emerald-500 text-white hover:bg-emerald-600" : "border border-line bg-white text-slate-700 hover:bg-slate-50"
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function ProfileHeader({
  user,
  demo,
  onAction,
}: {
  user: ProfileUser;
  demo: boolean;
  onAction: (action: "call" | "whatsapp" | "email" | "assign" | "note" | "task") => void;
}) {
  const router = useRouter();
  const [contact, setContact] = useState({ email: user.email, phone: user.phone, revealed: false });
  const [moreOpen, setMoreOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const reveal = () =>
    startTransition(async () => {
      const result = await revealContactAction(user.userId, demo);
      if (result.ok) setContact({ email: result.data.email, phone: result.data.phone, revealed: true });
      setMoreOpen(false);
    });

  return (
    <section aria-label="User profile" className="card grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-0">
      {/* identity */}
      <div className="flex items-center gap-3 lg:pr-4">
        <Avatar name={user.name} size="lg" className="!size-14 !text-lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold text-gray-900">{user.name}</h2>
            <span className={cx("inline-flex items-center gap-1 text-2xs font-medium", user.isOnline ? "text-emerald-600" : "text-slate-500")}>
              <StatusDot tone={user.isOnline ? "green" : "slate"} pulse={user.isOnline} />
              {user.isOnline ? "Active Now" : "Away"}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-2 text-2xs text-slate-500">
            User ID: <span className="font-mono text-slate-600">{user.displayId}</span>
            <Badge tone={user.isPaid ? "green" : "blue"} size="sm">
              {user.isPaid ? `${user.plan} User` : "Free User"}
            </Badge>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>{flagEmoji(user.country)}</span>
              {countryName(user.country)}
            </span>
            {user.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3 text-slate-400" aria-hidden /> {user.city}
              </span>
            )}
          </p>
          {user.targetRole && (
            <p className="mt-1 inline-flex items-center gap-1 text-2xs text-slate-600">
              <BriefcaseBusiness className="size-3 text-slate-400" aria-hidden /> {user.targetRole}
            </p>
          )}
        </div>
      </div>

      {/* contact */}
      <dl className="space-y-1.5 text-2xs text-slate-700 lg:border-l lg:border-slate-100 lg:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <dt className="sr-only">Email</dt>
          <Mail className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <dd className="truncate">{contact.email ?? "—"}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <dt className="sr-only">Phone</dt>
          <Phone className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <dd className="truncate">{contact.phone ?? "—"}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <dt className="sr-only">Joined</dt>
          <CalendarDays className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <dd>Joined {dateFmt(user.signupAt)}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <dt className="sr-only">Experience</dt>
          <BriefcaseBusiness className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <dd>{user.experience ? `${user.experience} Experience` : "Experience unknown"}</dd>
        </div>
      </dl>

      {/* intelligence */}
      <div className="flex items-center gap-4 lg:border-l lg:border-slate-100 lg:px-4">
        <PQLScore score={user.pqlScore} size={78} showTotal />
        <dl className="min-w-0 space-y-1 text-2xs">
          {user.pqlScore >= 75 && (
            <Badge tone="red" className="mb-1 inline-flex items-center gap-1">
              <Flame className="size-3" aria-hidden /> Hot Lead
            </Badge>
          )}
          <div className="flex items-center gap-2">
            <dt className="w-16 shrink-0 text-slate-500">Lifecycle</dt>
            <dd>
              <Badge tone="teal" size="sm">
                {lifecycleLabel(user.lifecycleStage)}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-16 shrink-0 text-slate-500">First Touch</dt>
            <dd className="truncate font-semibold text-gray-900">{user.firstTouch ?? "Unknown"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="w-16 shrink-0 text-slate-500">Campaign</dt>
            <dd className="truncate font-semibold text-gray-900">{user.campaign ?? "—"}</dd>
          </div>
        </dl>
      </div>

      {/* actions */}
      <div className="relative grid grid-cols-2 content-start gap-2 lg:border-l lg:border-slate-100 lg:pl-4">
        {(
          [
            ["Call", Phone, "call", "outline"],
            ["WhatsApp", MessageCircle, "whatsapp", "green"],
            ["Email", Mail, "email", "outline"],
            ["Assign Lead", UserPlus, "assign", "outline"],
            ["Add Note", NotebookPen, "note", "outline"],
            ["Create Task", CalendarDays, "task", "outline"],
          ] as const
        ).map(([label, icon, action, variant]) => (
          <ActionButton
            key={label}
            label={label}
            icon={icon}
            variant={variant}
            disabled={demo}
            title={demo ? `${label} is disabled while showing demo data` : label}
            onClick={() => onAction(action)}
          />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          className="focus-ring col-span-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-white text-2xs font-medium text-slate-600 hover:bg-slate-50"
        >
          ··· More <ChevronDown className={cx("size-3.5 transition-transform", moreOpen && "rotate-180")} aria-hidden />
        </button>
        {moreOpen && (
          <div role="menu" className="absolute top-full right-0 z-40 mt-1 w-56 animate-fade-in rounded-lg border border-line bg-white p-1 shadow-pop">
            <Tooltip content={demo ? "Disabled while showing demo data" : "Unmask email and phone (audited)"} align="end" className="w-full">
              <button
                type="button"
                role="menuitem"
                disabled={demo || pending || contact.revealed}
                onClick={reveal}
                className="focus-ring flex w-full rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {contact.revealed ? "Contact details revealed" : "Reveal contact details"}
              </button>
            </Tooltip>
            <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); router.refresh(); }} className="focus-ring flex w-full rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50">
              Refresh profile
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
