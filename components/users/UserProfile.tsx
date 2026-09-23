import { Mail, MapPin, Phone } from "lucide-react";
import { PQLScore } from "@/components/dashboard/PQLScore";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { countryName, flagEmoji, humanize, lifecycleLabel, relativeTime } from "@/lib/revenue-center/format";
import type { User360View } from "@/lib/revenue-center/types";

export function UserProfile({ user, now }: { user: User360View; now: number }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar name={user.name} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="user360-title" className="truncate text-base font-semibold text-gray-900">
            {user.name}
          </h2>
          <Badge tone={user.isPaid ? "green" : "slate"} size="sm">
            {user.isPaid ? `${humanize(user.plan.toLowerCase())} plan` : "Free user"}
          </Badge>
          <Badge tone="teal" size="sm">
            {lifecycleLabel(user.lifecycleStage)}
          </Badge>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-slate-500">
          <span className="max-w-40 truncate font-mono" title={user.displayId}>
            {user.displayId}
          </span>
          <span aria-hidden>·</span>
          <StatusDot tone={user.isOnline ? "green" : "slate"} pulse={user.isOnline} />
          {user.isOnline ? "Active now" : `Last active ${relativeTime(user.lastActiveAt, now)}`}
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 sm:grid-cols-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Email</dt>
            <Mail className="size-3.5 shrink-0 text-slate-400" aria-hidden />
            <dd className="truncate">{user.email ?? "—"}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Phone</dt>
            <Phone className="size-3.5 shrink-0 text-slate-400" aria-hidden />
            <dd className="truncate">{user.phone ?? "—"}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Location</dt>
            <MapPin className="size-3.5 shrink-0 text-slate-400" aria-hidden />
            <dd className="truncate">
              <span aria-hidden>{flagEmoji(user.country)} </span>
              {[user.city, countryName(user.country)].filter(Boolean).join(", ")}
            </dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="text-slate-400">Source</dt>
            <dd className="truncate">
              {user.acquisition.source ? humanize(user.acquisition.source) : "Unknown"}
              {user.acquisition.campaign ? ` · ${user.acquisition.campaign}` : ""}
            </dd>
          </div>
        </dl>
      </div>
      {user.pql && <PQLScore score={user.pql.score} size={52} />}
    </div>
  );
}
