import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authSettings, createToken, SESSION_COOKIE, verifyToken } from "@/lib/auth/token";

// Reading and writing the session cookie. proxy.ts already turns away signed-out
// requests; these checks repeat it where data is read or written, because a
// matcher change can silently stop the proxy covering a route (see the Next.js
// authentication guide).

export interface Session {
  email: string;
  expiresAt: Date;
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifyToken(token, authSettings());
}

/** For pages and layouts: the session, or a redirect to sign in. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function createSession(): Promise<void> {
  const settings = authSettings();
  if (!settings) throw new Error("Sign-in is not configured");
  const { token, expiresAt } = createToken(settings);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
