"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PqlFilters } from "@/lib/pql-intelligence/types";

// Usage-stage and signal cards narrow the lead queue by writing the same URL
// params the filter selects use, so there is one source of truth for "what is
// the table showing" and a shared link always reproduces the view.

const PARAM_FOR: Partial<Record<keyof PqlFilters, string>> = {
  usage: "usage",
  score: "score",
  intent: "intent",
  leadStatus: "lead_status",
  country: "country",
  nearLimit: "near_limit",
};

const DEFAULTS: Partial<Record<keyof PqlFilters, string>> = {
  usage: "all",
  score: "all",
  intent: "all",
  leadStatus: "all",
};

/** True when the current filters already match everything the patch would set. */
export const isPatchActive = (current: PqlFilters, patch: Partial<PqlFilters>): boolean =>
  Object.entries(patch).every(([key, value]) => current[key as keyof PqlFilters] === value);

export function useFilterPatch(current: PqlFilters) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  /** Apply a patch, or clear it when it is already the active view. */
  const apply = (patch: Partial<PqlFilters>, scrollToId?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const clearing = isPatchActive(current, patch);
    for (const [key, value] of Object.entries(patch)) {
      const param = PARAM_FOR[key as keyof PqlFilters];
      if (!param) continue;
      if (clearing || value === null || value === DEFAULTS[key as keyof PqlFilters]) params.delete(param);
      else params.set(param, String(value));
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    if (scrollToId) {
      requestAnimationFrame(() => document.getElementById(scrollToId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const clearLeadFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    for (const param of ["usage", "score", "intent", "owner", "lead_status"]) params.delete(param);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };

  return { apply, clearLeadFilters, pending, isActive: (patch: Partial<PqlFilters>) => isPatchActive(current, patch) };
}
