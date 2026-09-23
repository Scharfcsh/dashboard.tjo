import type { LiveEvent } from "@/lib/live-intelligence/types";

// Client-safe: the demo event stream draws from this pool (no server imports here).

/** Events the demo "live" stream cycles through. */
export const MOCK_EVENT_POOL: Omit<LiveEvent, "id" | "at">[] = [
  { userId: "TJO-15103", displayId: "TJO-15103", text: "reached 48/50 free Auto Applies", category: "opportunity" },
  { userId: "TJO-14921", displayId: "TJO-14921", text: "clicked Premium plan", category: "high_intent" },
  { userId: null, displayId: "TJO-14582", text: "completed checkout", category: "conversion" },
  { userId: "TJO-14702", displayId: "TJO-14702", text: "returned after 8 days inactive", category: "retention" },
  { userId: "TJO-15112", displayId: "TJO-15112", text: "uploaded first resume", category: "activation" },
  { userId: "TJO-14478", displayId: "TJO-14478", text: "experienced third Auto Apply failure", category: "product_issue" },
  { userId: "TJO-14433", displayId: "TJO-14433", text: "abandoned checkout (Pro, monthly)", category: "revenue_recovery" },
  { userId: "TJO-14955", displayId: "TJO-14955", text: "reached 45/50 free Auto Applies", category: "opportunity" },
  { userId: "TJO-15140", displayId: "TJO-15140", text: "completed signup", category: "activation" },
  { userId: "TJO-14882", displayId: "TJO-14882", text: "compared Pro and Premium plans", category: "high_intent" },
  { userId: "TJO-14207", displayId: "TJO-14207", text: "payment failed on renewal", category: "revenue_recovery" },
];

