"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, Plus } from "lucide-react";
import { DEFAULT_FILTERS, type LiveFilterState } from "@/lib/live-intelligence/derive";

// Lightweight saved cohorts: presets plus filters the viewer saved in this
// browser (localStorage; no backend persistence by design).

interface Cohort {
  id: string;
  label: string;
  filters: LiveFilterState;
}

const PRESETS: Cohort[] = [
  { id: "near-limit", label: "🔥 Near Auto Apply Limit", filters: { ...DEFAULT_FILTERS, chips: ["apps_45"] } },
  { id: "high-intent", label: "💰 High Purchase Intent", filters: { ...DEFAULT_FILTERS, pql: "80", chips: ["visited_pricing"] } },
  { id: "friction", label: "⚠ Product Friction", filters: { ...DEFAULT_FILTERS, chips: ["repeated_failure"] } },
  { id: "new-users", label: "🌱 New Users", filters: { ...DEFAULT_FILTERS, chips: ["new_today"] } },
];

const STORAGE_KEY = "tjo.live.cohorts";

function readSaved(): Cohort[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Cohort[]) : [];
  } catch {
    return [];
  }
}

export function SavedCohorts({ current, onApply, canSave }: { current: LiveFilterState; onApply: (f: LiveFilterState) => void; canSave: boolean }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Cohort[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const toggle = () => {
    if (!open) setSaved(readSaved());
    setOpen((o) => !o);
    setNaming(false);
  };

  const save = () => {
    const label = name.trim();
    if (!label) return;
    const next = [...readSaved().filter((c) => c.label !== label), { id: `saved-${Date.now()}`, label, filters: current }];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode): keep it for this session only.
    }
    setSaved(next);
    setNaming(false);
    setName("");
  };

  const pick = (c: Cohort) => {
    onApply(c.filters);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Saved cohorts"
        title="Saved cohorts"
        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2 text-xs font-medium text-slate-700 shadow-card hover:border-slate-300 2xl:px-2.5"
      >
        <Bookmark className="size-3.5 text-slate-500" aria-hidden />
        <span className="hidden 2xl:inline">Cohorts</span>
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-40 mt-1 w-64 animate-fade-in rounded-lg border border-line bg-white p-1 shadow-pop">
          <p className="px-2.5 pt-1.5 pb-1 text-2xs font-semibold tracking-wide text-slate-400 uppercase">Presets</p>
          {PRESETS.map((c) => (
            <button key={c.id} type="button" role="menuitem" onClick={() => pick(c)} className="focus-ring flex w-full rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50">
              {c.label}
            </button>
          ))}
          {saved.length > 0 && (
            <>
              <p className="px-2.5 pt-2 pb-1 text-2xs font-semibold tracking-wide text-slate-400 uppercase">Saved in this browser</p>
              {saved.map((c) => (
                <button key={c.id} type="button" role="menuitem" onClick={() => pick(c)} className="focus-ring flex w-full rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50">
                  {c.label}
                </button>
              ))}
            </>
          )}
          <div className="mt-1 border-t border-slate-100 pt-1">
            {naming ? (
              <form
                className="flex items-center gap-1 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <label className="sr-only" htmlFor="cohort-name">Cohort name</label>
                <input
                  id="cohort-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="Cohort name"
                  className="focus-ring h-7 min-w-0 flex-1 rounded-md border border-line px-2 text-xs"
                />
                <button type="submit" aria-label="Save cohort" className="focus-ring inline-flex size-7 items-center justify-center rounded-md bg-brand text-white hover:bg-brand-strong">
                  <Check className="size-3.5" aria-hidden />
                </button>
              </form>
            ) : (
              <button
                type="button"
                role="menuitem"
                disabled={!canSave}
                onClick={() => setNaming(true)}
                className="focus-ring flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                title={canSave ? undefined : "Set some filters first"}
              >
                <Plus className="size-3.5" aria-hidden /> Save current filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
