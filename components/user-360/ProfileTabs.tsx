"use client";

import { cx } from "@/components/ui/tones";
import { PROFILE_TABS, TAB_LABELS, type ProfileTab } from "@/lib/user-360/types";

export function ProfileTabs({ active, onSelect }: { active: ProfileTab; onSelect: (tab: ProfileTab) => void }) {
  return (
    <div className="card overflow-x-auto px-1.5">
      <nav aria-label="Profile sections" className="flex min-w-max gap-0.5">
        {PROFILE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-current={tab === active ? "page" : undefined}
            onClick={() => onSelect(tab)}
            className={cx(
              "focus-ring relative rounded-md px-3.5 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              tab === active ? "text-brand-strong" : "text-slate-500 hover:text-gray-900"
            )}
          >
            {TAB_LABELS[tab]}
            {tab === active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" aria-hidden />}
          </button>
        ))}
      </nav>
    </div>
  );
}
