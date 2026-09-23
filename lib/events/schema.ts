import { ApiError } from "@/lib/http/errors";

// ---------------------------------------------------------------------------
// Ingestion payload contract (pure - no I/O, covered by test/unit/events-schema).
//
// Accepted bodies:  single event object | [event, ...] | { "events": [event, ...] }
// Event fields:     event_id, event_name, user_id, anonymous_id, session_id,
//                   occurred_at, page, properties
// Unknown top-level fields are NOT an error: they are folded into `properties`
// (explicit `properties` keys win). This is how the SOP's extra dimensions
// (country, device_type, platform, plan, acquisition, feature, entity_id) land.
// ---------------------------------------------------------------------------

export const MAX_BATCH = 500;
const MAX_ID = 128;
const MAX_PAGE = 2048;
const MAX_PROPERTIES_BYTES = 32_000;
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const EVENT_NAME_RE = /^[A-Za-z0-9_.:-]{1,100}$/;

const KNOWN_FIELDS = new Set([
  "event_id",
  "event_name",
  "user_id",
  "anonymous_id",
  "session_id",
  "occurred_at",
  "page",
  "properties",
]);

export interface NormalizedEvent {
  event_id: string;
  event_name: string;
  user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  occurred_at: string;
  page: string | null;
  properties: Record<string, unknown>;
}

export interface Rejection {
  index: number;
  code: "VALIDATION_FAILED" | "SERVER_ONLY_EVENT";
  message: string;
}

export type NormalizeResult = { ok: true; value: NormalizedEvent } | { ok: false; message: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Pull the event list out of any accepted envelope. Throws 400 for anything else. */
export function extractBatch(body: unknown): unknown[] {
  let events: unknown[];
  if (Array.isArray(body)) events = body;
  else if (isPlainObject(body) && Array.isArray(body.events)) events = body.events;
  else if (isPlainObject(body) && "event_name" in body) events = [body];
  else {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Body must be an event object, an array of events, or { events: [...] }"
    );
  }
  if (events.length === 0) throw new ApiError("VALIDATION_FAILED", "Batch is empty");
  if (events.length > MAX_BATCH) throw new ApiError("PAYLOAD_TOO_LARGE", `Batch exceeds ${MAX_BATCH} events`);
  return events;
}

function optionalId(raw: Record<string, unknown>, key: string): string | null | Error {
  const v = raw[key];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return new Error(`${key} must be a string or null`);
  if (v.length > MAX_ID) return new Error(`${key} exceeds ${MAX_ID} characters`);
  return v;
}

export function normalizeEvent(raw: unknown, now: Date = new Date()): NormalizeResult {
  if (!isPlainObject(raw)) return { ok: false, message: "event must be an object" };

  const { event_id, event_name, occurred_at, page, properties } = raw;

  if (typeof event_id !== "string" || event_id.length === 0 || event_id.length > MAX_ID) {
    return { ok: false, message: `event_id is required (string, 1-${MAX_ID} chars)` };
  }
  if (typeof event_name !== "string" || !EVENT_NAME_RE.test(event_name)) {
    return { ok: false, message: "event_name is required (1-100 chars of A-Z a-z 0-9 _ . : -)" };
  }

  const ids: Record<string, string | null> = {};
  for (const key of ["user_id", "anonymous_id", "session_id"]) {
    const v = optionalId(raw, key);
    if (v instanceof Error) return { ok: false, message: v.message };
    ids[key] = v;
  }
  if (!ids.user_id && !ids.anonymous_id) {
    return { ok: false, message: "one of user_id or anonymous_id is required" };
  }

  if (typeof occurred_at !== "string") return { ok: false, message: "occurred_at is required (ISO-8601 string)" };
  const ts = Date.parse(occurred_at);
  if (Number.isNaN(ts)) return { ok: false, message: "occurred_at is not a valid ISO-8601 timestamp" };
  if (ts - now.getTime() > MAX_FUTURE_SKEW_MS) {
    return { ok: false, message: "occurred_at is more than 24h in the future" };
  }

  if (page !== undefined && page !== null && (typeof page !== "string" || page.length > MAX_PAGE)) {
    return { ok: false, message: `page must be a string up to ${MAX_PAGE} chars, or null` };
  }
  if (properties !== undefined && properties !== null && !isPlainObject(properties)) {
    return { ok: false, message: "properties must be an object" };
  }

  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_FIELDS.has(k)) extras[k] = v;
  }
  const mergedProperties = { ...extras, ...((properties as Record<string, unknown> | null | undefined) ?? {}) };
  if (Buffer.byteLength(JSON.stringify(mergedProperties), "utf8") > MAX_PROPERTIES_BYTES) {
    return { ok: false, message: `properties exceed ${MAX_PROPERTIES_BYTES} bytes` };
  }

  return {
    ok: true,
    value: {
      event_id,
      event_name,
      user_id: ids.user_id,
      anonymous_id: ids.anonymous_id,
      session_id: ids.session_id,
      occurred_at: new Date(ts).toISOString(),
      page: (page as string | null | undefined) ?? null,
      properties: mergedProperties,
    },
  };
}

/** Two-letter country from the payload, if it sent a usable one. */
export function payloadCountry(properties: Record<string, unknown>): string | null {
  const c = properties.country;
  return typeof c === "string" && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null;
}
