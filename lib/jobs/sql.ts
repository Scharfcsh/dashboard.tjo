// SQL fragments shared by jobs. Kept here so "the events that belong to a user"
// is written exactly once: direct user_id events plus anonymous events from any
// browser that later identified as that user.

/**
 * Resolved events for the users in `$<userParam>::text[]`, optionally bounded by
 * occurred_at. Produces columns: user_id, event_id, event_name, session_id,
 * occurred_at, page, properties, trusted, ingest_source, country, user_agent.
 */
export function resolvedEventsFor(userParam: number, bounds?: { from: number; to: number }) {
  const time = bounds ? ` AND e.occurred_at >= $${bounds.from} AND e.occurred_at < $${bounds.to}` : "";
  const cols =
    "e.event_id, e.event_name, e.session_id, e.occurred_at, e.page, e.properties, e.trusted, e.ingest_source, e.country, e.user_agent";
  return `
    SELECT t.user_id, ${cols}
    FROM unnest($${userParam}::text[]) AS t(user_id)
    JOIN user_events e ON e.user_id = t.user_id${time}
    UNION ALL
    SELECT t.user_id, ${cols}
    FROM unnest($${userParam}::text[]) AS t(user_id)
    JOIN identity_links il ON il.user_id = t.user_id
    JOIN user_events e ON e.anonymous_id = il.anonymous_id AND e.user_id IS NULL${time}`;
}

export const OPEN_LEAD_STATUSES = ["new", "contacted", "interested", "callback"] as const;
export const OPEN_LEAD_SQL = `('new', 'contacted', 'interested', 'callback')`;
