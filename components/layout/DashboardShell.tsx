"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Sidebar } from "@/components/layout/Sidebar";

export function DashboardShell({ alertCount, email, children }: { alertCount: number; email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[12.25rem] border-r border-line lg:block">
        <Sidebar alertCount={alertCount} email={email} />
      </aside>

      {/* Tablet / mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="focus-ring rounded-md p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 animate-fade-in bg-gray-900/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 animate-drawer-in border-r border-line shadow-pop">
            <Sidebar alertCount={alertCount} email={email} onNavigate={() => setOpen(false)} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="focus-ring absolute top-4 right-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <main className="lg:pl-[12.25rem]">
        <div className="mx-auto max-w-[1680px] px-4 py-4 sm:px-5">{children}</div>
      </main>
    </div>
  );
}
