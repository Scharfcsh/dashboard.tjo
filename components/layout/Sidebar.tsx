"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "@/components/layout/nav";
import { cx } from "@/components/ui/tones";

function NavLink({ item, active, alertCount, onNavigate }: { item: NavItem; active: boolean; alertCount: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cx(
          "focus-ring group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium transition-colors",
          active ? "bg-brand-soft text-brand-strong" : "text-slate-600 hover:bg-slate-50 hover:text-gray-900"
        )}
      >
        {active && <span className="absolute inset-y-1.5 -left-2.5 w-[3px] rounded-r bg-brand" aria-hidden />}
        <Icon className={cx("size-4 shrink-0", active ? "text-brand" : "text-slate-400 group-hover:text-slate-600")} strokeWidth={2} aria-hidden />
        <span className="truncate">{item.label}</span>
        {item.badge === "alerts" && alertCount > 0 && (
          <span
            className="ml-1 inline-flex min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-semibold leading-4.5 text-white"
            aria-label={`${alertCount} open alerts`}
          >
            {alertCount > 99 ? "99+" : alertCount}
          </span>
        )}
      </Link>
    </li>
  );
}

export function Sidebar({ alertCount, onNavigate }: { alertCount: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-full flex-col bg-white px-2.5 pb-3">
      <div className="flex h-16 items-center px-2">
        <Link href="/overview" onClick={onNavigate} className="focus-ring rounded-md" aria-label="TopJobOffer home">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Primary" className="mt-2 flex-1 overflow-y-auto">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} alertCount={alertCount} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>

      <nav aria-label="Secondary" className="mt-4">
        <ul className="space-y-0.5">
          {SECONDARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} alertCount={0} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>

      <button
        type="button"
        className="focus-ring mt-3 flex w-full items-center gap-3 rounded-xl border border-line px-2.5 py-2.5 text-left transition-colors hover:bg-slate-50"
        aria-label="Account menu"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white">AD</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.8125rem] font-semibold text-gray-900">Admin</span>
          <span className="block truncate text-2xs text-slate-500">admin@topjoboffer.com</span>
        </span>
        <ChevronDown className="size-3.5 text-slate-400" aria-hidden />
      </button>
    </div>
  );
}
