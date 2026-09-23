import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison; false for missing values. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still spend the comparison so length is not trivially observable.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** The presented key: `x-api-key`, or `Authorization: Bearer <key>`. */
export function presentedKey(headers: Headers): string | null {
  const direct = headers.get("x-api-key");
  if (direct) return direct.trim();
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * Who performed a mutating admin action. KNOWN GAP: there is no per-user auth
 * yet - every caller shares ADMIN_API_KEY, so this header is trusted as-is.
 * Replace with the authenticated principal when RBAC lands.
 */
export function actorId(headers: Headers): string | null {
  return headers.get("x-actor-id")?.trim() || null;
}
