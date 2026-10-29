import { NextResponse, type NextRequest } from "next/server";
import { authSettings, SESSION_COOKIE, verifyToken } from "@/lib/auth/token";
import { presentedKey, safeEqual } from "@/lib/http/auth";

// ---------------------------------------------------------------------------
// Auth gate for everything except static assets.
//
//   /login                   open (it is how you get a session).
//   /api/events, /api/logs   ingestion - the route handlers do split-trust auth
//                            (INGEST_API_KEY or allow-listed browser origin).
//   other /api/*             ADMIN_API_KEY via `x-api-key` / `Authorization: Bearer`,
//                            or a signed-in dashboard session.
//   pages                    a signed-in session, else redirect to /login.
//
// Fails closed: with sign-in not configured, no session is ever valid.
// Server Functions also check the session themselves (lib/auth/guard.ts).
//
// KNOWN GAP: one shared login and one shared admin key, no roles. Caller vs
// manager vs founder permissions (SOP 17.1) are not enforced yet.
// ---------------------------------------------------------------------------

const INGEST_PATHS = new Set(["/api/events", "/api/logs"]);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  if (path === "/login") return NextResponse.next();

  const signedIn = verifyToken(request.cookies.get(SESSION_COOKIE)?.value, authSettings()) !== null;

  if (path === "/api" || path.startsWith("/api/")) {
    if (INGEST_PATHS.has(path)) return NextResponse.next();
    if (signedIn) return NextResponse.next();

    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "ADMIN_API_KEY is not configured" } },
        { status: 500 }
      );
    }
    if (!safeEqual(presentedKey(request.headers), adminKey)) {
      return Response.json({ error: { code: "UNAUTHORIZED", message: "Valid admin API key required" } }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.search = "";
  if (path !== "/") login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's static output, the favicon and files in public/.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
