import { z } from "zod";
import { getConfig } from "@/lib/config";
import { ApiError } from "@/lib/http/errors";

// ---------------------------------------------------------------------------
// THE timezone convention. Read this before touching any date logic.
//
//   * Every instant is stored and returned in UTC (ISO-8601 with `Z`).
//   * A "business date" is a calendar date in BUSINESS_TIMEZONE (default
//     Asia/Kolkata). "Today" means today in that zone, for every endpoint.
//   * Date ranges are inclusive business dates [from, to]. They are converted to
//     a half-open UTC window [startUtc, endUtc) for timestamp columns, and used
//     directly against `business_date` columns (user_daily_metrics).
//   * SQL uses the same zone via business_date()/business_today(), which read
//     the per-connection setting that lib/db/pool.ts sets from the same env var.
//   * The previous period for trends is the equally long window ending the day
//     before `from`.
// ---------------------------------------------------------------------------

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function businessTimezone(): string {
  return getConfig().BUSINESS_TIMEZONE;
}

/** Offset of `tz` from UTC at instant `ms`, in milliseconds (IST = +19800000). */
function tzOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Business date (YYYY-MM-DD) of an instant. */
export function toBusinessDate(instant: Date | number, tz = businessTimezone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    typeof instant === "number" ? new Date(instant) : instant
  );
}

export function businessToday(now: Date = new Date(), tz = businessTimezone()): string {
  return toBusinessDate(now, tz);
}

/** UTC instant at which business date `date` begins. DST-safe. */
export function startOfBusinessDate(date: string, tz = businessTimezone()): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  let result = guess - tzOffsetMs(guess, tz);
  // Re-evaluate at the candidate: correct when the guess straddled a DST switch.
  result = guess - tzOffsetMs(result, tz);
  return new Date(result);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export const RANGE_PRESETS = ["today", "yesterday", "7d", "30d", "90d", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface DateRange {
  preset: RangePreset;
  timezone: string;
  /** Inclusive business dates. */
  from: string;
  to: string;
  days: number;
  /** Half-open UTC window for timestamp columns. */
  startUtc: Date;
  endUtc: Date;
  previous: { from: string; to: string; startUtc: Date; endUtc: Date };
}

export const rangeQuerySchema = z.object({
  range: z.enum(RANGE_PRESETS).optional(),
  from: z.string().regex(DATE_RE, "from must be YYYY-MM-DD").optional(),
  to: z.string().regex(DATE_RE, "to must be YYYY-MM-DD").optional(),
});

export const MAX_RANGE_DAYS = 400;

export function parseRange(
  input: { range?: RangePreset; from?: string; to?: string },
  opts: { defaultPreset?: RangePreset; now?: Date; tz?: string } = {}
): DateRange {
  const tz = opts.tz ?? businessTimezone();
  const today = businessToday(opts.now ?? new Date(), tz);
  const preset: RangePreset = input.range ?? (input.from || input.to ? "custom" : (opts.defaultPreset ?? "today"));

  let from: string;
  let to: string;
  switch (preset) {
    case "today":
      from = to = today;
      break;
    case "yesterday":
      from = to = addDays(today, -1);
      break;
    case "7d":
    case "30d":
    case "90d":
      to = today;
      from = addDays(today, -(Number.parseInt(preset, 10) - 1));
      break;
    case "custom":
      if (!input.from || !input.to) {
        throw new ApiError("VALIDATION_FAILED", "range=custom requires from and to (YYYY-MM-DD, business timezone)");
      }
      from = input.from;
      to = input.to;
      break;
  }

  const days = diffDays(from, to) + 1;
  if (days < 1) throw new ApiError("VALIDATION_FAILED", "from must be on or before to");
  if (days > MAX_RANGE_DAYS) throw new ApiError("VALIDATION_FAILED", `Range may not exceed ${MAX_RANGE_DAYS} days`);

  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  return {
    preset,
    timezone: tz,
    from,
    to,
    days,
    startUtc: startOfBusinessDate(from, tz),
    endUtc: startOfBusinessDate(addDays(to, 1), tz),
    previous: {
      from: prevFrom,
      to: prevTo,
      startUtc: startOfBusinessDate(prevFrom, tz),
      endUtc: startOfBusinessDate(addDays(prevTo, 1), tz),
    },
  };
}

/** The `meta` block every date-ranged response carries. */
export function rangeMeta(range: DateRange) {
  return {
    timezone: range.timezone,
    from: range.from,
    to: range.to,
    start_utc: range.startUtc.toISOString(),
    end_utc_exclusive: range.endUtc.toISOString(),
    previous: { from: range.previous.from, to: range.previous.to },
  };
}
