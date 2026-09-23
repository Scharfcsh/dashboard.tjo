import { isIP } from "node:net";
import { getPool } from "@/lib/db/pool";

// ---------------------------------------------------------------------------
// Backend request logs from betterapply's logging middleware. Infra data, kept
// in request_logs - never mixed into user_events. Idempotent on request_id.
// ---------------------------------------------------------------------------

const KNOWN = new Set([
  "request_id",
  "method",
  "path",
  "status_code",
  "response_time_ms",
  "user_id",
  "ip_address",
  "user_agent",
  "occurred_at",
]);

export interface NormalizedLog {
  request_id: string;
  method: string;
  path: string;
  status_code: number;
  response_time_ms: number | null;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
  extra: Record<string, unknown>;
}

/** Accepts one log, an array, or { logs: [...] } (also { events: [...] } for sender symmetry). */
export function extractLogBatch(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.logs)) return o.logs;
    if (Array.isArray(o.events)) return o.events;
    if ("request_id" in o) return [o];
  }
  return null;
}

export function normalizeLog(raw: unknown): { ok: true; value: NormalizedLog } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "log must be an object" };
  const r = raw as Record<string, unknown>;

  if (typeof r.request_id !== "string" || !r.request_id || r.request_id.length > 128) {
    return { ok: false, message: "request_id is required (string, 1-128 chars)" };
  }
  if (typeof r.method !== "string" || !/^[A-Za-z]{1,10}$/.test(r.method)) {
    return { ok: false, message: "method is required (HTTP verb)" };
  }
  if (typeof r.path !== "string" || !r.path || r.path.length > 2048) {
    return { ok: false, message: "path is required (string, up to 2048 chars)" };
  }
  const status = typeof r.status_code === "string" ? Number(r.status_code) : r.status_code;
  if (typeof status !== "number" || !Number.isInteger(status) || status < 100 || status > 599) {
    return { ok: false, message: "status_code is required (integer 100-599)" };
  }
  let rt: number | null = null;
  if (r.response_time_ms !== undefined && r.response_time_ms !== null) {
    rt = Number(r.response_time_ms);
    if (!Number.isFinite(rt) || rt < 0) return { ok: false, message: "response_time_ms must be a non-negative number" };
  }
  if (typeof r.occurred_at !== "string" || Number.isNaN(Date.parse(r.occurred_at))) {
    return { ok: false, message: "occurred_at is required (ISO-8601 string)" };
  }
  const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);
  const ip = str(r.ip_address, 64);

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!KNOWN.has(k)) extra[k] = v;

  return {
    ok: true,
    value: {
      request_id: r.request_id,
      method: r.method.toUpperCase(),
      path: r.path,
      status_code: status,
      response_time_ms: rt,
      user_id: str(r.user_id, 128),
      // An unparseable IP is kept in `extra` rather than failing the whole log.
      ip_address: ip && isIP(ip) ? ip : null,
      user_agent: str(r.user_agent, 1024),
      occurred_at: new Date(r.occurred_at).toISOString(),
      extra: ip && !isIP(ip) ? { ...extra, raw_ip_address: ip } : extra,
    },
  };
}

export async function insertLogs(logs: NormalizedLog[]): Promise<number> {
  if (logs.length === 0) return 0;
  const { rowCount } = await getPool().query(
    `INSERT INTO request_logs
       (request_id, method, path, status_code, response_time_ms, user_id, ip_address, user_agent, occurred_at, extra)
     SELECT request_id, method, path, status_code, response_time_ms, user_id, ip_address::inet, user_agent,
            occurred_at::timestamptz, extra::jsonb
     FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::float8[], $6::text[], $7::text[], $8::text[],
                 $9::text[], $10::text[])
          AS t(request_id, method, path, status_code, response_time_ms, user_id, ip_address, user_agent, occurred_at, extra)
     ON CONFLICT (request_id) DO NOTHING`,
    [
      logs.map((l) => l.request_id),
      logs.map((l) => l.method),
      logs.map((l) => l.path),
      logs.map((l) => l.status_code),
      logs.map((l) => l.response_time_ms),
      logs.map((l) => l.user_id),
      logs.map((l) => l.ip_address),
      logs.map((l) => l.user_agent),
      logs.map((l) => l.occurred_at),
      logs.map((l) => JSON.stringify(l.extra)),
    ]
  );
  return rowCount ?? 0;
}
