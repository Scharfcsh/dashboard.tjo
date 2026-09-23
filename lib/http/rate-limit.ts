// ---------------------------------------------------------------------------
// Token bucket per key, in process memory. KNOWN GAP: per instance - N app
// instances allow N x the rate. Good enough to blunt a runaway browser tab or a
// naive flood on keyless ingestion; move to Redis/Postgres if that stops being true.
// ---------------------------------------------------------------------------

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000;

export function allowRequest(key: string, perMinute: number, now = Date.now()): boolean {
  const refillPerMs = perMinute / 60_000;
  const bucket = buckets.get(key) ?? { tokens: perMinute, updatedAt: now };
  bucket.tokens = Math.min(perMinute, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
  bucket.updatedAt = now;

  if (buckets.size >= MAX_KEYS && !buckets.has(key)) {
    // Crude bound on memory: drop the oldest entry (Map keeps insertion order).
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
