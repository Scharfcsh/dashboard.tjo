"use client";

import { useSearchParams } from "next/navigation";
import type { OpportunityFocus, OpportunityRow } from "@/lib/revenue-center/types";

// KPI cards narrow the opportunity table without a server round trip: the focus
// lives in the URL (shareable) but is written with history.replaceState, which
// Next.js syncs into useSearchParams without re-rendering the page on the server.

export const FOCUS_LABELS: Record<OpportunityFocus, string> = {
  hot: "Hot PQLs (score 75+)",
  pricing: "Visited pricing",
  checkout: "Checkout started",
  quota: "50/50 exhausted",
  usage40: "40+ free applies used",
  usage45: "45+ free applies used",
  payment_failed: "Payment failed",
  online: "Active now",
};

const PREDICATES: Record<OpportunityFocus, (r: OpportunityRow) => boolean> = {
  hot: (r) => r.pqlScore >= 75,
  pricing: (r) => r.pricingViews > 0,
  checkout: (r) => r.checkoutStatus === "started" || r.checkoutStatus === "abandoned",
  quota: (r) => r.autoApplyUsed >= r.autoApplyLimit,
  usage40: (r) => r.autoApplyUsed >= 40,
  usage45: (r) => r.autoApplyUsed >= 45,
  payment_failed: (r) => r.paymentFailed,
  online: (r) => r.isOnline,
};

export const matchesFocus = (focus: OpportunityFocus | null, row: OpportunityRow) => (focus ? PREDICATES[focus](row) : true);

export function useOpportunityFocus(): OpportunityFocus | null {
  const value = useSearchParams().get("focus");
  return value && value in FOCUS_LABELS ? (value as OpportunityFocus) : null;
}

export function setOpportunityFocus(focus: OpportunityFocus | null, scroll = true) {
  const url = new URL(window.location.href);
  if (focus) url.searchParams.set("focus", focus);
  else url.searchParams.delete("focus");
  window.history.replaceState(null, "", url);
  if (scroll && focus) {
    document.getElementById("opportunities")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
