import type { Disposition } from "@/lib/dashboards/sales";
import type { LeadPriority, QueueLead, SalesRange } from "@/lib/sales-crm/types";
import type { Tone } from "@/lib/revenue-center/types";

// Pure derivations for the Sales CRM. No database, no React - so the rules a
// caller sees can be unit-tested directly.

/** Greeting by local hour, so "Good evening, Rahul" is true when it says it. */
export function greeting(nowMs: number): string {
  const hour = new Date(nowMs).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export const ROLE_LABELS: Record<string, string> = {
  caller: "Sales Executive",
  sales_manager: "Sales Manager",
  support: "Support",
  founder: "Founder",
  admin: "Admin",
  growth: "Growth",
  product: "Product",
};

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role.replace(/_/g, " ");

export const isManagerRole = (role: string): boolean => role === "sales_manager" || role === "founder" || role === "admin";

/** Pricing intent as a word a caller can act on, from the last 30 days of views. */
export function pricingIntent(views: number, checkoutStarted: boolean, planClicked: boolean): QueueLead["pricingIntent"] {
  if (checkoutStarted || views >= 5) return "Very High";
  if (planClicked || views >= 3) return "High";
  if (views >= 1) return "Medium";
  return "Low";
}

const STATUS_PRESENTATION: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New Lead", tone: "blue" },
  contacted: { label: "Follow-up", tone: "amber" },
  interested: { label: "Interested", tone: "green" },
  callback: { label: "Callback", tone: "purple" },
  converted: { label: "Converted", tone: "green" },
  lost: { label: "Lost", tone: "slate" },
};

export const statusPresentation = (status: string) =>
  STATUS_PRESENTATION[status] ?? { label: status.replace(/_/g, " "), tone: "slate" as Tone };

/**
 * The single button on a queue row. A lead that asked for WhatsApp gets
 * WhatsApp; one with no phone gets email; everything else gets a call.
 */
export function nextActionFor(
  lastDisposition: string | null,
  nextAction: string | null,
  hasPhone: boolean
): QueueLead["nextAction"] {
  if (lastDisposition === "whatsapp_requested" || nextAction === "send_whatsapp_template") return "whatsapp";
  if (!hasPhone) return "email";
  return "call";
}

/**
 * Why this lead is top of the queue, in the caller's words. Mirrors the SQL
 * ordering in lib/dashboards/sales.ts, so the explanation cannot drift from it.
 */
export function queuedBecause(lead: {
  callbackIsDue: boolean;
  slaBreached: boolean;
  priority: LeadPriority | null;
  pqlScore: number;
}): string {
  if (lead.callbackIsDue) return "Callback is due now";
  if (lead.slaBreached && lead.priority === "P0") return "P0 past its response SLA and never contacted";
  if (lead.priority === "P0") return "Highest priority lead in your queue";
  if (lead.priority === "P1") return "Next by priority";
  return `Highest PQL score in your queue (${lead.pqlScore})`;
}

export interface DispositionMeta {
  value: Disposition;
  label: string;
  tone: Tone;
  /** Dispositions that cannot be saved without a follow-up time. */
  requiresCallback?: boolean;
  /** Dispositions that end the lead, so the UI warns before sending. */
  closesLead?: boolean;
}

export const DISPOSITION_META: DispositionMeta[] = [
  { value: "interested", label: "Interested", tone: "green" },
  { value: "wants_to_buy", label: "Wants to Buy", tone: "green" },
  { value: "callback", label: "Callback", tone: "amber", requiresCallback: true },
  { value: "no_answer", label: "No Answer", tone: "slate" },
  { value: "whatsapp_requested", label: "WhatsApp Requested", tone: "blue" },
  { value: "price_concern", label: "Price Concern", tone: "orange" },
  { value: "feature_concern", label: "Feature Concern", tone: "orange" },
  { value: "needs_support", label: "Needs Support", tone: "purple" },
  { value: "not_interested", label: "Not Interested", tone: "red", closesLead: true },
  { value: "converted", label: "Converted", tone: "teal", closesLead: true },
];

// Every disposition the API accepts must be offered, or a caller cannot record
// what actually happened. test/unit/sales-crm.test.ts asserts they stay in sync.

export const dispositionMeta = (value: string): DispositionMeta | undefined =>
  DISPOSITION_META.find((d) => d.value === value);

/**
 * The pitch a caller reads out. Built from what the user actually did, so it
 * says something true rather than a generic upsell line.
 */
export function pitchFor(input: {
  firstName: string;
  used: number;
  limit: number;
  pricingViews: number;
  planInterest: string | null;
  checkoutStarted: boolean;
  paymentFailed: boolean;
}): string {
  const left = Math.max(0, input.limit - input.used);
  const plan = input.planInterest ?? "Pro";

  if (input.paymentFailed) {
    return `${input.firstName}'s payment did not go through, so they are still on the free plan by accident. Confirm they still want ${plan}, find out what failed, and offer to send a fresh payment link.`;
  }
  if (input.checkoutStarted) {
    return `${input.firstName} started checkout for ${plan} and did not finish. Ask what stopped them — price, a payment problem, or second thoughts — and resolve that one thing before mentioning anything else.`;
  }
  if (left === 0) {
    return `${input.firstName} has used all ${input.limit} free Auto Applies, so the product has stopped working for them today. Acknowledge that first, ask how the applications went, then explain how ${plan} keeps them running.`;
  }
  if (left <= 5 && input.pricingViews > 0) {
    return `${input.firstName} is getting strong value from Auto Apply and has only ${left} free application${left === 1 ? "" : "s"} left. Ask about their experience so far, uncover any upgrade objection, and explain how ${plan} lets the applications continue without limits.`;
  }
  if (left <= 5) {
    return `${input.firstName} is about to run out of free Auto Applies (${left} left) but has not looked at pricing. Ask how the applications are going first, then introduce ${plan} as the way to keep going.`;
  }
  if (input.pricingViews >= 3) {
    return `${input.firstName} has checked pricing ${input.pricingViews} times without upgrading, so something is holding them back. Ask directly what they are weighing up, and address that rather than pitching features.`;
  }
  return `${input.firstName} is active and getting value from Auto Apply (${input.used} of ${input.limit} used). Ask how the job search is going and what would make it easier — sell only if they raise a limit or a need.`;
}

/** "11m", "1h 20m", "2d" — a duration a caller reads at a glance. */
export function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.round(hours / 24)}d`;
}

/** Seconds typed as mm:ss. Returns null when the text is not a duration. */
export function parseDurationInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(":");
  if (parts.length > 2 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [a, b] = parts.length === 2 ? parts : ["0", parts[0]!];
  const seconds = Number(a) * 60 + Number(b);
  return Number.isFinite(seconds) && seconds <= 86_400 ? seconds : null;
}

/** Pipeline stage colours, warming as a lead moves toward revenue. */
const PIPELINE_TONES: Record<string, Tone> = {
  new_lead: "slate",
  contacted: "blue",
  connected: "indigo",
  interested: "purple",
  follow_up: "amber",
  payment_link: "orange",
  converted: "green",
};

export const pipelineStageTone = (stage: string): Tone => PIPELINE_TONES[stage] ?? "slate";

/** "in 12m", "in 2h", "in 3d" - for a time that has not happened yet. */
export function timeUntil(iso: string, nowMs: number): string {
  const ms = Date.parse(iso) - nowMs;
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "in under a minute";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  return `in ${Math.round(hours / 24)}d`;
}

export const RANGE_LABELS: Record<SalesRange, string> = { today: "Today", "7d": "7 Days", "30d": "30 Days" };
