import { getConfig } from "@/lib/config";

/** CORS headers for keyless browser ingestion, or null when the origin is not allowed. */
export function ingestCorsHeaders(origin: string | null): Record<string, string> | null {
  if (!origin) return null;
  const normalized = origin.replace(/\/$/, "");
  if (!getConfig().ALLOWED_ORIGINS.includes(normalized)) return null;
  return {
    "Access-Control-Allow-Origin": normalized,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
