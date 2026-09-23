import { getConfig } from "@/lib/config";
import { presentedKey, safeEqual } from "@/lib/http/auth";
import { ingestCorsHeaders } from "@/lib/http/cors";
import { ApiError } from "@/lib/http/errors";
import { allowRequest, clientIp } from "@/lib/http/rate-limit";

// ---------------------------------------------------------------------------
// Split-trust ingestion auth.
//
//   key present + correct  -> trusted (server-to-server; any event accepted)
//   key present + wrong    -> 401 (never silently downgrade a bad key)
//   no key                 -> only if allowKeyless (POST /api/events) AND the
//                             Origin is allow-listed AND under the rate limit.
//                             Untrusted: server-only events are rejected per event.
//
// Browsers cannot hold a secret (and sendBeacon cannot send headers), so the
// keyless path protects what matters - revenue/usage/identity events - rather
// than pretending a public key is authentication.
// ---------------------------------------------------------------------------

export interface IngestPrincipal {
  trusted: boolean;
  corsHeaders: Record<string, string>;
}

export function authenticateIngest(req: Request, opts: { allowKeyless: boolean }): IngestPrincipal {
  const config = getConfig();
  const origin = req.headers.get("origin");
  const cors = ingestCorsHeaders(origin) ?? {};
  const key = presentedKey(req.headers);

  if (key !== null) {
    if (!safeEqual(key, config.INGEST_API_KEY)) throw new ApiError("UNAUTHORIZED", "Invalid API key");
    return { trusted: true, corsHeaders: cors };
  }

  if (!opts.allowKeyless) throw new ApiError("UNAUTHORIZED", "API key required");
  if (!origin || Object.keys(cors).length === 0) {
    throw new ApiError("FORBIDDEN_ORIGIN", "API key required (origin not allowed for keyless ingestion)");
  }
  if (!allowRequest(`ingest:${clientIp(req.headers)}`, config.INGEST_RATE_LIMIT_PER_MINUTE)) {
    throw new ApiError("RATE_LIMITED", "Too many requests");
  }
  return { trusted: false, corsHeaders: cors };
}
