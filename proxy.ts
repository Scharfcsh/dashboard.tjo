import { NextResponse, type NextRequest } from "next/server";
import { presentedKey, safeEqual } from "@/lib/http/auth";

// ---------------------------------------------------------------------------
// Auth gate for /api/*.
//
//   /api/events, /api/logs   ingestion - the route handlers do split-trust auth
//                            (INGEST_API_KEY or allow-listed browser origin).
//   everything else          ADMIN_API_KEY via `x-api-key` or `Authorization: Bearer`.
//
// KNOWN GAP: one shared admin key, no roles. Caller vs manager vs founder
// permissions (SOP 17.1) are not enforced yet; `x-actor-id` is trusted as given.
// ---------------------------------------------------------------------------

const INGEST_PATHS = new Set(["/api/events", "/api/logs"]);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/$/, "");
  if (INGEST_PATHS.has(path)) return NextResponse.next();

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

export const config = {
  matcher: "/api/:path*",
};
