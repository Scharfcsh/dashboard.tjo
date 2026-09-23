import { getConfig } from "@/lib/config";
import { getPool } from "@/lib/db/pool";
import { eventNamesAtLeast } from "@/lib/events/catalog";

// ---------------------------------------------------------------------------
// user_sessions from browser events. The session id is minted by the main app's
// tracker (30 idle minutes => new id, shared across tabs), so grouping is by
// session_id; this job derives start/end, duration, device, landing page and
// counts. A session is "ended" once it has been idle for SESSION_IDLE_MINUTES.
// Server events carry no session and are not part of any session row; timelines
// place them by time instead.
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  device_type: "mobile" | "tablet" | "desktop" | null;
  browser: string | null;
  os: string | null;
}

/** Deliberately small UA sniffing - enough for dashboards, not fingerprinting. */
export function parseUserAgent(ua: string | null, hint?: string | null): DeviceInfo {
  const normalizedHint = hint?.toLowerCase();
  const hinted =
    normalizedHint === "mobile" || normalizedHint === "tablet" || normalizedHint === "desktop" ? normalizedHint : null;
  if (!ua) return { device_type: hinted, browser: null, os: null };

  const device_type = hinted ?? (/iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone|iPod/i.test(ua) ? "mobile" : "desktop");

  let browser: string | null = null;
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS/.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os: string | null = null;
  if (/Windows/.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return { device_type, browser, os };
}

interface SessionAggRow {
  session_id: string;
  user_id: string | null;
  anonymous_id: string | null;
  started_at: Date;
  last_activity_at: Date;
  user_agent: string | null;
  device_hint: string | null;
  country: string | null;
  landing_page: string | null;
  exit_page: string | null;
  first_properties: Record<string, unknown> | null;
  event_count: string;
  important_count: string;
}

export async function rebuildSessions(sessionIds: string[], now = new Date()): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const pool = getPool();
  const idleMs = getConfig().SESSION_IDLE_MINUTES * 60_000;

  const { rows } = await pool.query<SessionAggRow>(
    `SELECT e.session_id,
            (array_agg(COALESCE(e.user_id, il.user_id) ORDER BY e.occurred_at DESC)
               FILTER (WHERE COALESCE(e.user_id, il.user_id) IS NOT NULL))[1]                   AS user_id,
            (array_agg(e.anonymous_id ORDER BY e.occurred_at) FILTER (WHERE e.anonymous_id IS NOT NULL))[1] AS anonymous_id,
            min(e.occurred_at)                                                                  AS started_at,
            max(e.occurred_at)                                                                  AS last_activity_at,
            (array_agg(e.user_agent ORDER BY e.occurred_at) FILTER (WHERE e.user_agent IS NOT NULL))[1] AS user_agent,
            (array_agg(e.properties->>'device_type' ORDER BY e.occurred_at)
               FILTER (WHERE e.properties ? 'device_type'))[1]                                  AS device_hint,
            (array_agg(e.country ORDER BY e.occurred_at) FILTER (WHERE e.country IS NOT NULL))[1] AS country,
            (array_agg(e.page ORDER BY e.occurred_at) FILTER (WHERE e.page IS NOT NULL))[1]     AS landing_page,
            (array_agg(e.page ORDER BY e.occurred_at DESC) FILTER (WHERE e.page IS NOT NULL))[1] AS exit_page,
            (array_agg(e.properties ORDER BY e.occurred_at))[1]                                 AS first_properties,
            count(*)                                                                            AS event_count,
            count(*) FILTER (WHERE e.event_name = ANY($2::text[]))                              AS important_count
     FROM user_events e
     LEFT JOIN identity_links il ON e.user_id IS NULL AND il.anonymous_id = e.anonymous_id
     WHERE e.session_id = ANY($1::text[]) AND e.ingest_source = 'client'
     GROUP BY e.session_id`,
    [sessionIds, eventNamesAtLeast("medium")]
  );
  if (rows.length === 0) return 0;

  const records = rows.map((r) => {
    const device = parseUserAgent(r.user_agent, r.device_hint);
    const props = r.first_properties ?? {};
    const acquisition = Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer"]
        .filter((k) => typeof props[k] === "string")
        .map((k) => [k, props[k]])
    );
    const ended = now.getTime() - r.last_activity_at.getTime() >= idleMs ? r.last_activity_at : null;
    return {
      ...r,
      ...device,
      acquisition,
      ended_at: ended,
      duration_seconds: Math.max(0, Math.round((r.last_activity_at.getTime() - r.started_at.getTime()) / 1000)),
    };
  });

  await pool.query(
    `INSERT INTO user_sessions (session_id, user_id, anonymous_id, started_at, last_activity_at, ended_at,
                               duration_seconds, device_type, browser, os, country, landing_page, exit_page,
                               acquisition, event_count, important_event_count, updated_at)
     SELECT session_id, user_id, anonymous_id, started_at, last_activity_at, ended_at, duration_seconds, device_type,
            browser, os, country, landing_page, exit_page, acquisition::jsonb, event_count, important_count, now()
     FROM unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[], $5::timestamptz[], $6::timestamptz[],
                 $7::int[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[],
                 $15::int[], $16::int[])
          AS t(session_id, user_id, anonymous_id, started_at, last_activity_at, ended_at, duration_seconds,
               device_type, browser, os, country, landing_page, exit_page, acquisition, event_count, important_count)
     ON CONFLICT (session_id) DO UPDATE SET
       user_id = EXCLUDED.user_id, anonymous_id = EXCLUDED.anonymous_id, started_at = EXCLUDED.started_at,
       last_activity_at = EXCLUDED.last_activity_at, ended_at = EXCLUDED.ended_at,
       duration_seconds = EXCLUDED.duration_seconds, device_type = EXCLUDED.device_type, browser = EXCLUDED.browser,
       os = EXCLUDED.os, country = EXCLUDED.country, landing_page = EXCLUDED.landing_page,
       exit_page = EXCLUDED.exit_page, acquisition = EXCLUDED.acquisition, event_count = EXCLUDED.event_count,
       important_event_count = EXCLUDED.important_event_count, updated_at = now()`,
    [
      records.map((r) => r.session_id),
      records.map((r) => r.user_id),
      records.map((r) => r.anonymous_id),
      records.map((r) => r.started_at),
      records.map((r) => r.last_activity_at),
      records.map((r) => r.ended_at),
      records.map((r) => r.duration_seconds),
      records.map((r) => r.device_type),
      records.map((r) => r.browser),
      records.map((r) => r.os),
      records.map((r) => r.country),
      records.map((r) => r.landing_page),
      records.map((r) => r.exit_page),
      records.map((r) => JSON.stringify(r.acquisition)),
      records.map((r) => Number(r.event_count)),
      records.map((r) => Number(r.important_count)),
    ]
  );
  return records.length;
}

/** Sessions that went idle without a new event never get recomputed - close them here. */
export async function closeIdleSessions(): Promise<number> {
  const { rowCount } = await getPool().query(
    `UPDATE user_sessions SET ended_at = last_activity_at, updated_at = now()
     WHERE ended_at IS NULL AND last_activity_at < now() - make_interval(mins => $1)`,
    [getConfig().SESSION_IDLE_MINUTES]
  );
  return rowCount ?? 0;
}
