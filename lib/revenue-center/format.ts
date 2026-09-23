// Formatting shared by server and client. Pure functions; "now" is always
// passed in so server and client render identical text (no hydration drift).

const numberFmt = new Intl.NumberFormat("en-IN");
const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export const formatNumber = (n: number) => numberFmt.format(n);
export const formatCurrency = (n: number) => inrFmt.format(n);

export function formatPercent(n: number | null, digits?: number): string {
  if (n === null || Number.isNaN(n)) return "—";
  const d = digits ?? (Math.abs(n) < 10 && n % 1 !== 0 ? 1 : 0);
  return `${n.toFixed(d)}%`;
}

export function formatSigned(n: number, unit: string): string {
  const abs = Math.abs(n);
  const text = abs % 1 === 0 || abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return `${n >= 0 ? "+" : "−"}${text}${unit}`;
}

export function relativeTime(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const diff = Math.max(0, nowMs - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function compactAgo(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const diff = Math.max(0, nowMs - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function secondsAgo(iso: string, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  return `${m} min ago`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

/** ISO-3166 alpha-2 -> regional-indicator flag emoji. */
export function flagEmoji(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function countryName(code: string | null): string {
  if (!code) return "Unknown";
  const short: Record<string, string> = { US: "USA", GB: "UK", AE: "UAE" };
  try {
    return short[code.toUpperCase()] ?? regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export const humanize = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";

const STAGE_LABELS: Record<string, string> = {
  pql: "PQL",
  power_user: "Power user",
  new: "New",
  onboarded: "Onboarded",
  activated: "Activated",
  engaged: "Engaged",
  dormant: "Dormant",
  resurrected: "Resurrected",
  paid: "Paid",
};

export const lifecycleLabel = (stage: string) => STAGE_LABELS[stage] ?? humanize(stage);

/** "10:32 PM" for today, "16 Sep, 10:32 PM" for older events (relative to `nowMs`). */
export function formatEventTime(iso: string, nowMs: number): string {
  const sameDay = new Date(iso).toDateString() === new Date(nowMs).toDateString();
  if (sameDay) return formatClock(iso);
  return `${new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${formatClock(iso)}`;
}
