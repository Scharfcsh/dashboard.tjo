import type { NextRequest } from "next/server";
import { authenticateIngest } from "@/lib/http/ingest-auth";
import { errorResponse, handler, readJson } from "@/lib/http/respond";
import { extractLogBatch, insertLogs, normalizeLog, type NormalizedLog } from "@/lib/logs/ingest";

// POST /api/logs - backend request logs. Server-to-server only (INGEST_API_KEY required).
//   200 { accepted, duplicates, rejected }  |  400 no valid logs  |  401 missing/bad key

const MAX_BATCH = 1000;

export const POST = handler(async (req: NextRequest) => {
  authenticateIngest(req, { allowKeyless: false });
  const batch = extractLogBatch(await readJson(req, 2_000_000));
  if (!batch || batch.length === 0) {
    return errorResponse("VALIDATION_FAILED", "Body must be a log object, an array of logs, or { logs: [...] }");
  }
  if (batch.length > MAX_BATCH) return errorResponse("PAYLOAD_TOO_LARGE", `Batch exceeds ${MAX_BATCH} logs`);

  const valid: NormalizedLog[] = [];
  const rejected: { index: number; code: string; message: string }[] = [];
  batch.forEach((raw, index) => {
    const r = normalizeLog(raw);
    if (r.ok) valid.push(r.value);
    else rejected.push({ index, code: "VALIDATION_FAILED", message: r.message });
  });
  if (valid.length === 0) return errorResponse("VALIDATION_FAILED", "No valid logs in payload", { rejected });

  const inserted = await insertLogs(valid);
  return Response.json({ accepted: inserted, duplicates: valid.length - inserted, rejected });
});
