import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/http/auth";

// ---------------------------------------------------------------------------
// Stateless dashboard session: `<base64url(email)>.<expiresAtMs>.<hmac>`.
//
// The HMAC key mixes SESSION_SECRET with the password, so changing either one
// signs every existing session out. Pure and dependency-free so proxy.ts can
// import it - it must not pull in server-only modules or the database.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "tjo_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthSettings {
  email: string;
  password: string;
  secret: string;
}

/** Sign-in settings from the environment, or null when any is missing (locked). */
export function authSettings(env: Record<string, string | undefined> = process.env): AuthSettings | null {
  const email = env.DASHBOARD_EMAIL?.trim().toLowerCase();
  const password = env.DASHBOARD_PASSWORD;
  const secret = env.SESSION_SECRET;
  if (!email || !password || !secret) return null;
  return { email, password, secret };
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function sign(payload: string, settings: AuthSettings): string {
  return createHmac("sha256", `${settings.secret}\0${settings.password}`).update(payload).digest("base64url");
}

export function createToken(settings: AuthSettings, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = now + SESSION_TTL_MS;
  const payload = `${b64url(settings.email)}.${expiresAt}`;
  return { token: `${payload}.${sign(payload, settings)}`, expiresAt: new Date(expiresAt) };
}

/** The signed-in email, or null for a missing, tampered, expired or foreign token. */
export function verifyToken(
  token: string | null | undefined,
  settings: AuthSettings | null,
  now = Date.now()
): { email: string; expiresAt: Date } | null {
  if (!token || !settings) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [emailPart, expPart, signature] = parts as [string, string, string];
  if (!safeEqual(signature, sign(`${emailPart}.${expPart}`, settings))) return null;
  const expiresAt = Number(expPart);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  const email = Buffer.from(emailPart, "base64url").toString("utf8");
  // A token for a previous DASHBOARD_EMAIL is no longer valid.
  if (email !== settings.email) return null;
  return { email, expiresAt: new Date(expiresAt) };
}

/** Where to go after signing in: same-site paths only, never a protocol-relative URL. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/overview";
  if (next.startsWith("/login")) return "/overview";
  return next;
}
