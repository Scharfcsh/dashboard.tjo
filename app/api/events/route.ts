import { after, type NextRequest } from "next/server";
import { isServerOnly } from "@/lib/events/catalog";
import { insertEvents, linkIdentities, updatePresence } from "@/lib/events/ingest";
import { extractBatch, normalizeEvent, type NormalizedEvent, type Rejection } from "@/lib/events/schema";
import { authenticateIngest } from "@/lib/http/ingest-auth";
import { ingestCorsHeaders } from "@/lib/http/cors";
import { errorResponse, readJson, toErrorResponse } from "@/lib/http/respond";

// POST /api/events - product event ingestion (see lib/events/schema.ts for the contract).
//
//   200 { accepted, duplicates, rejected: [{ index, code, message }] }   at least one valid event
//   400 VALIDATION_FAILED   malformed envelope, or every event rejected
//   401 UNAUTHORIZED        bad key / keyless from a non-allowed origin
//   429 RATE_LIMITED        keyless client over its per-IP budget

export async function OPTIONS(req: NextRequest) {
  const cors = ingestCorsHeaders(req.headers.get("origin"));
  return new Response(null, { status: 204, headers: cors ?? undefined });
}

export async function POST(req: NextRequest) {
  const cors = ingestCorsHeaders(req.headers.get("origin")) ?? {};
  try {
    const principal = authenticateIngest(req, { allowKeyless: true });
    const batch = extractBatch(await readJson(req));

    const now = new Date();
    const valid: NormalizedEvent[] = [];
    const rejected: Rejection[] = [];
    batch.forEach((raw, index) => {
      const result = normalizeEvent(raw, now);
      if (!result.ok) {
        rejected.push({ index, code: "VALIDATION_FAILED", message: result.message });
      } else if (!principal.trusted && isServerOnly(result.value.event_name)) {
        rejected.push({
          index,
          code: "SERVER_ONLY_EVENT",
          message: `${result.value.event_name} is accepted only from authenticated server requests`,
        });
      } else {
        valid.push(result.value);
      }
    });

    if (valid.length === 0) {
      return errorResponse("VALIDATION_FAILED", "No valid events in payload", { rejected }, cors);
    }

    const inserted = await insertEvents(valid, {
      trusted: principal.trusted,
      geoCountry: req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country"),
      userAgent: req.headers.get("user-agent"),
    });

    // Cheap cache writes after the response is sent. Only for newly inserted
    // events, so a replayed batch cannot move presence backwards or forwards.
    const insertedIds = new Set(inserted);
    const fresh = valid.filter((e) => insertedIds.has(e.event_id));
    if (fresh.length > 0) {
      after(async () => {
        try {
          await Promise.all([updatePresence(fresh, principal.trusted), linkIdentities(fresh)]);
        } catch (err) {
          console.error("[ingest] presence/identity update failed", err);
        }
      });
    }

    return Response.json(
      { accepted: inserted.length, duplicates: valid.length - inserted.length, rejected },
      { status: 200, headers: cors }
    );
  } catch (err) {
    const res = toErrorResponse(err);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }
}
