import { getPool } from "@/lib/db/pool";
import { eventDefinition } from "@/lib/events/catalog";
import { payloadCountry, type NormalizedEvent } from "@/lib/events/schema";

// ---------------------------------------------------------------------------
// The write path for POST /api/events. Deliberately small: one multi-row insert,
// idempotent on event_id (first write wins). Everything derived happens in jobs,
// except two O(batch) cache writes (presence + identity links) that run after
// the response via next/server `after()`.
// ---------------------------------------------------------------------------

export interface IngestContext {
  trusted: boolean;
  /** Geo header set by the edge (Cloudflare / Vercel), only meaningful for browser requests. */
  geoCountry: string | null;
  userAgent: string | null;
}

export async function insertEvents(events: NormalizedEvent[], ctx: IngestContext): Promise<string[]> {
  if (events.length === 0) return [];

  const source = ctx.trusted ? "server" : "client";
  const cols = {
    event_id: [] as string[],
    event_name: [] as string[],
    user_id: [] as (string | null)[],
    anonymous_id: [] as (string | null)[],
    session_id: [] as (string | null)[],
    occurred_at: [] as string[],
    page: [] as (string | null)[],
    properties: [] as string[],
    country: [] as (string | null)[],
    user_agent: [] as (string | null)[],
  };

  for (const e of events) {
    cols.event_id.push(e.event_id);
    cols.event_name.push(e.event_name);
    cols.user_id.push(e.user_id);
    cols.anonymous_id.push(e.anonymous_id);
    cols.session_id.push(e.session_id);
    cols.occurred_at.push(e.occurred_at);
    cols.page.push(e.page);
    cols.properties.push(JSON.stringify(e.properties));
    cols.country.push(payloadCountry(e.properties) ?? (ctx.trusted ? null : ctx.geoCountry));
    // A server-to-server request's user agent is the main app's HTTP client, not the user's.
    cols.user_agent.push(ctx.trusted ? null : ctx.userAgent);
  }

  // ON CONFLICT DO NOTHING + RETURNING yields only the rows actually inserted;
  // the difference is duplicates. A batch containing the same id twice is also safe.
  const { rows } = await getPool().query<{ event_id: string }>(
    `INSERT INTO user_events
       (event_id, event_name, user_id, anonymous_id, session_id, occurred_at, page,
        properties, trusted, ingest_source, country, user_agent)
     SELECT t.event_id, t.event_name, t.user_id, t.anonymous_id, t.session_id, t.occurred_at::timestamptz,
            t.page, t.properties::jsonb, $11, $12, t.country, t.user_agent
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
                 $8::text[], $9::text[], $10::text[])
          AS t(event_id, event_name, user_id, anonymous_id, session_id, occurred_at, page, properties, country, user_agent)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [
      cols.event_id,
      cols.event_name,
      cols.user_id,
      cols.anonymous_id,
      cols.session_id,
      cols.occurred_at,
      cols.page,
      cols.properties,
      cols.country,
      cols.user_agent,
      ctx.trusted,
      source,
    ]
  );
  return rows.map((r) => r.event_id);
}

/**
 * Heartbeat cache. "Online now" is read only from user_presence, never from raw
 * events. Browser events always count as presence; server events only when they
 * are a user action (auto_apply_started) - a webhook or worker outcome is not the
 * user being on the site.
 */
export async function updatePresence(events: NormalizedEvent[], trusted: boolean, now = new Date()): Promise<void> {
  const latest = new Map<string, NormalizedEvent>();
  for (const e of events) {
    if (!e.user_id) continue;
    if (trusted && !eventDefinition(e.event_name).meaningful) continue;
    const prev = latest.get(e.user_id);
    if (!prev || prev.occurred_at < e.occurred_at) latest.set(e.user_id, e);
  }
  if (latest.size === 0) return;

  const nowIso = now.toISOString();
  const rows = [...latest.values()];
  await getPool().query(
    `INSERT INTO user_presence (user_id, last_seen_at, current_session_id, current_page, last_event_name, updated_at)
     SELECT user_id, seen_at::timestamptz, session_id, page, event_name, now()
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
          AS t(user_id, seen_at, session_id, page, event_name)
     ON CONFLICT (user_id) DO UPDATE SET
       last_seen_at       = EXCLUDED.last_seen_at,
       current_session_id = COALESCE(EXCLUDED.current_session_id, user_presence.current_session_id),
       current_page       = COALESCE(EXCLUDED.current_page, user_presence.current_page),
       last_event_name    = EXCLUDED.last_event_name,
       updated_at         = now()
     WHERE user_presence.last_seen_at <= EXCLUDED.last_seen_at`,
    [
      rows.map((e) => e.user_id),
      // Clamp client clock skew: nobody is seen in the future.
      rows.map((e) => (e.occurred_at > nowIso ? nowIso : e.occurred_at)),
      rows.map((e) => e.session_id),
      rows.map((e) => e.page),
      rows.map((e) => e.event_name),
    ]
  );
}

/** Remember which browser belongs to which user, so earlier anonymous events can be attributed. */
export async function linkIdentities(events: NormalizedEvent[]): Promise<void> {
  const links = new Map<string, { user_id: string; at: string }>();
  for (const e of events) {
    if (!e.user_id || !e.anonymous_id) continue;
    const prev = links.get(e.anonymous_id);
    if (!prev || e.occurred_at < prev.at) links.set(e.anonymous_id, { user_id: e.user_id, at: e.occurred_at });
  }
  if (links.size === 0) return;
  const entries = [...links.entries()];
  await getPool().query(
    `INSERT INTO identity_links (anonymous_id, user_id, linked_at)
     SELECT anonymous_id, user_id, linked_at::timestamptz
     FROM unnest($1::text[], $2::text[], $3::text[]) AS t(anonymous_id, user_id, linked_at)
     ON CONFLICT (anonymous_id) DO NOTHING`,
    [entries.map(([a]) => a), entries.map(([, v]) => v.user_id), entries.map(([, v]) => v.at)]
  );
}
